import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Controls, Coordinates, HoverData, HandControl } from '../types';

interface HoloEarthProps {
  onControlsUpdate: (controls: Controls) => void;
  onLocationSelect: (coords: Coordinates) => void;
  onHover: (data: HoverData | null) => void;
  onReady: () => void;
  handControl?: HandControl | null;
  // 视图图层：普通地表 / 数据高亮（用于比赛展示数据图层）
  viewLayer?: 'surface' | 'data';
  // 外部请求将地球对准指定经纬度（课堂笔记回放/教学定位）
  focusCoords?: Coordinates | null;
}

// Helper: Convert Lat/Lng to 3D Vector
// NOTE: This must match the texture mapping.
// Texture (0,0) is at (0,0,1) in local space with this math.
const latLngToVector3 = (lat: number, lng: number, radius: number) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 90) * (Math.PI / 180); // +90 offset to align with texture

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
};

const loadTextureWithFallback = (loader: THREE.TextureLoader, urls: string[]) => {
  return new Promise<THREE.Texture>((resolve, reject) => {
    const tryLoad = (idx: number) => {
      if (idx >= urls.length) {
        reject(new Error(`All texture urls failed: ${urls.join(", ")}`));
        return;
      }
      loader.load(
        urls[idx],
        (tex) => resolve(tex),
        undefined,
        () => tryLoad(idx + 1),
      );
    };

    tryLoad(0);
  });
};

// Helper: Point in Polygon Algorithm (Ray Casting)
const isPointInPolygon = (point: number[], vs: number[][][]) => {
    // point = [lng, lat]
    // vs = array of polygons (GeoJSON structure)
    const x = point[0], y = point[1];
    let inside = false;
    
    // Handle MultiPolygons by flattening simple logic or iterating rings
    // GeoJSON Polygon: [ [ [lng,lat], ... ], [hole] ]
    // We only check the outer ring (index 0) for simplicity in hit testing
    
    for (let i = 0; i < vs.length; i++) {
        const ring = vs[i]; 
        for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
            const xi = ring[j][0], yi = ring[j][1];
            const xj = ring[k][0], yj = ring[k][1];
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

    }
    
    return inside;
};

const HoloEarth: React.FC<HoloEarthProps> = ({ onControlsUpdate, onLocationSelect, onHover, onReady, handControl, viewLayer = 'surface', focusCoords = null }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const earthGroupRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cursorRef = useRef<THREE.Mesh | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const bordersGroupRef = useRef<THREE.Group | null>(null);
  const highlightMeshRef = useRef<THREE.LineSegments | null>(null);
  
  // Data State
  const geoJsonData = useRef<any>(null);
  
  // Interaction State
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const rotationVelocity = useRef({ x: 0, y: 0.0005 }); 
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const lastReportedDragState = useRef<boolean>(false);
  const lastHoverCheckTime = useRef<number>(0);
  const initializedRef = useRef(false);
  const handControlRef = useRef<HandControl | null>(null);
  const gridRef = useRef<THREE.LineSegments | null>(null);
  const earthMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const dataOverlayRef = useRef<THREE.Points | null>(null);
  const targetQuatRef = useRef<THREE.Quaternion | null>(null);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync latest hand control from props into a ref for use inside the render loop
  useEffect(() => {
    handControlRef.current = handControl ?? null;
  }, [handControl]);

  // 外部定位：把标记点移动到指定坐标，并让该点平滑转到视野正前方
  useEffect(() => {
    if (!focusCoords || !earthGroupRef.current) return;

    const v = latLngToVector3(focusCoords.lat, focusCoords.lng, 1.0);

    if (markerRef.current) {
      markerRef.current.position.copy(v);
      markerRef.current.visible = true;
    }

    const from = v.clone().normalize();
    const to = new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    targetQuatRef.current = q;
  }, [focusCoords]);

  // Fetch GeoJSON（改为本地静态资源，部署时放到 public/data/countries.geojson）
  useEffect(() => {
    fetch('/data/countries.geojson')
      .then(res => res.json())
      .then(data => {
        geoJsonData.current = data;
        drawGlobalBorders(data);
      })
      .catch(err => console.error("Failed to load borders:", err));
  }, []);

  const drawGlobalBorders = (data: any) => {
    if (!earthGroupRef.current) return;

    const material = new THREE.LineBasicMaterial({ color: 0x0891b2, transparent: true, opacity: 0.15 });
    const positions: number[] = [];

    data.features.forEach((feature: any) => {
        const geometry = feature.geometry;
        
        const processRing = (ring: number[][]) => {
            for (let i = 0; i < ring.length - 1; i++) {
                const v1 = latLngToVector3(ring[i][1], ring[i][0], 1.002);
                const v2 = latLngToVector3(ring[i+1][1], ring[i+1][0], 1.002);
                positions.push(v1.x, v1.y, v1.z);
                positions.push(v2.x, v2.y, v2.z);
            }
        };

        if (geometry.type === 'Polygon') {
            geometry.coordinates.forEach((ring: number[][]) => processRing(ring));
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach((polygon: number[][][]) => {
                polygon.forEach((ring: number[][]) => processRing(ring));
            });
        }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, material);
    
    // Borders must be added to the Earth Group so they rotate with it
    bordersGroupRef.current = new THREE.Group();
    bordersGroupRef.current.add(lines);
    earthGroupRef.current.add(bordersGroupRef.current);
  };

  const highlightCountry = (feature: any) => {
      if (!earthGroupRef.current) return;
      
      // Remove previous highlight
      if (highlightMeshRef.current) {
          earthGroupRef.current.remove(highlightMeshRef.current);
          highlightMeshRef.current.geometry.dispose();
          highlightMeshRef.current = null;
      }

      if (!feature) return;

      const material = new THREE.LineBasicMaterial({ 
          color: 0xffff00, // Bright Yellow/Gold for selection
          linewidth: 2,
          transparent: true, 
          opacity: 0.8,
          blending: THREE.AdditiveBlending
      });
      
      const positions: number[] = [];

      const processRing = (ring: number[][]) => {
          for (let i = 0; i < ring.length - 1; i++) {
              // Lift it slightly higher than global borders (1.004)
              const v1 = latLngToVector3(ring[i][1], ring[i][0], 1.004);
              const v2 = latLngToVector3(ring[i+1][1], ring[i+1][0], 1.004);
              positions.push(v1.x, v1.y, v1.z);
              positions.push(v2.x, v2.y, v2.z);
          }
      };

      const geometry = feature.geometry;
      if (geometry.type === 'Polygon') {
          geometry.coordinates.forEach((ring: number[][]) => processRing(ring));
      } else if (geometry.type === 'MultiPolygon') {
          geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon.forEach((ring: number[][]) => processRing(ring));
          });
      }

      const buffGeo = new THREE.BufferGeometry();
      buffGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mesh = new THREE.LineSegments(buffGeo, material);
      
      highlightMeshRef.current = mesh;
      earthGroupRef.current.add(mesh);
  };

  useEffect(() => {
    let requestID: number;
    const mountNode = mountRef.current;

    if (!mountNode || initializedRef.current) return;

    const init = async (width: number, height: number) => {
      if (!mountNode) return;

      // Scene
      const scene = new THREE.Scene();
      // 教学场景：使用偏浅的蓝灰色背景而不是纯黑太空
      scene.background = new THREE.Color(0xe5f2ff);
      
      // Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.z = 2.5; 
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true, 
        powerPreference: "high-performance" 
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      // 略微提高曝光，让整体更接近教科书插图的亮度
      renderer.toneMappingExposure = 1.28;
      mountNode.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Group
      const earthGroup = new THREE.Group();
      earthGroupRef.current = earthGroup;
      scene.add(earthGroup);

      // Textures（默认使用轻量 2048 贴图，保证首屏加载速度；高清卫星贴图保留为可选资源）
      const textureLoader = new THREE.TextureLoader();
      const earthMap = textureLoader.load('/textures/earth_atmos_2048.jpg');
      const earthSpecular = textureLoader.load('/textures/earth_specular_2048.jpg');
      const earthNormal = textureLoader.load('/textures/earth_normal_2048.jpg');

      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      earthMap.anisotropy = maxAnisotropy;
      earthNormal.anisotropy = maxAnisotropy;
      earthSpecular.anisotropy = maxAnisotropy;

      // 提升放大时清晰度与色彩准确性（离线可部署，不依赖外部服务）
      earthMap.colorSpace = THREE.SRGBColorSpace;
      earthMap.generateMipmaps = true;
      earthMap.minFilter = THREE.LinearMipmapLinearFilter;
      earthMap.magFilter = THREE.LinearFilter;

      earthNormal.generateMipmaps = true;
      earthNormal.minFilter = THREE.LinearMipmapLinearFilter;
      earthNormal.magFilter = THREE.LinearFilter;

      earthSpecular.generateMipmaps = true;
      earthSpecular.minFilter = THREE.LinearMipmapLinearFilter;
      earthSpecular.magFilter = THREE.LinearFilter;

      // Geometry & Material
      // Geometry is rotated -90 deg Y to align Prime Meridian with Z axis in latLngToVector3 logic
      const geometry = new THREE.SphereGeometry(1, 128, 128); 
      geometry.rotateY(-Math.PI / 2); 

      const material = new THREE.MeshStandardMaterial({
        map: earthMap,
        normalMap: earthNormal,
        roughnessMap: earthSpecular,
        roughness: 0.55,
        metalness: 0.02,
        // 略偏冷的柔和白色，让海洋更蓝、陆地更清晰
        color: new THREE.Color(0xf3f8ff),
      });

      const earth = new THREE.Mesh(geometry, material);
      earthMeshRef.current = earth;
      earthMaterialRef.current = material;
      earthGroup.add(earth);

      // Grid Overlay
      const gridGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(1.001, 36, 36));
      gridGeo.rotateY(-Math.PI / 2);
      const gridMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.035 });
      const grid = new THREE.LineSegments(gridGeo, gridMat);
      gridRef.current = grid;
      earthGroup.add(grid);

      // Cursor
      const cursorGeo = new THREE.RingGeometry(0.02, 0.03, 32);
      const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const cursor = new THREE.Mesh(cursorGeo, cursorMat);
      cursor.visible = false;
      cursorRef.current = cursor;
      earthGroup.add(cursor);

      // Marker
      const markerGeo = new THREE.SphereGeometry(0.01, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.visible = false;
      markerRef.current = marker;
      earthGroup.add(marker);
      
      const markerGlowGeo = new THREE.RingGeometry(0.015, 0.03, 32);
      const markerGlowMat = new THREE.MeshBasicMaterial({ color: 0xff3366, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const markerGlow = new THREE.Mesh(markerGlowGeo, markerGlowMat);
      marker.add(markerGlow);

      // Lights（更自然：环境光 + 半球光 + 太阳方向光；教学场景整体提亮，暗面也能看清）
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);
      const hemiLight = new THREE.HemisphereLight(0xe5f2ff, 0xdbe7d3, 0.6);
      scene.add(hemiLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
      dirLight.position.set(6, 3, 6);
      scene.add(dirLight);

      // Stars
      const starGeo = new THREE.BufferGeometry();
      const starCount = 1500;
      const starPos = new Float32Array(starCount * 3);
      for(let i=0; i<starCount*3; i++) {
        starPos[i] = (Math.random() - 0.5) * 20; 
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.012, transparent: true, opacity: 0.22});
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      onReady();

      const animate = () => {
        if (!earthGroupRef.current) return;

        const ctrl = handControlRef.current;
        if (ctrl) {
          // 手势控制：根据 HandControl 直接旋转地球
          const rotFactor = 0.08; // 提高旋转系数，让挥动带来更大幅度转动
          const rotX = ctrl.rotX ?? 0;
          const rotY = ctrl.rotY ?? 0;
          earthGroupRef.current.rotation.y += rotY * rotFactor;
          earthGroupRef.current.rotation.x += rotX * rotFactor;

          // 手势缩放（单手张合）
          if (cameraRef.current && typeof ctrl.zoomDelta === 'number') {
            const minDistance = 1.1;
            const maxDistance = 5.0;
            let newZ = cameraRef.current.position.z + ctrl.zoomDelta;
            if (newZ < minDistance) newZ = minDistance;
            if (newZ > maxDistance) newZ = maxDistance;
            cameraRef.current.position.z = newZ;
          }

          // 有手势时，逐渐衰减惯性旋转
          rotationVelocity.current.x *= 0.9;
          rotationVelocity.current.y *= 0.9;
        } else {
          // 没有手势输入时，保留原来的惯性逻辑
          if (!isDragging.current) {
            rotationVelocity.current.x *= 0.95;
            rotationVelocity.current.y *= 0.95;
            if (Math.abs(rotationVelocity.current.y) < 0.00005) rotationVelocity.current.y = 0.00005; 
          }

          earthGroupRef.current.rotation.y += rotationVelocity.current.y;
          earthGroupRef.current.rotation.x += rotationVelocity.current.x;
        }

        earthGroupRef.current.rotation.x = Math.max(-0.6, Math.min(0.6, earthGroupRef.current.rotation.x));

        // Sync Matrix for accurate raycasting next frame
        earthGroupRef.current.updateMatrixWorld();

        // Cursor Anim
        if (cursorRef.current && cursorRef.current.visible) {
             cursorRef.current.lookAt(camera.position);
             cursorRef.current.rotation.z -= 0.02;
        }
        // Marker Anim
        if (markerRef.current?.visible) {
             const scale = 1 + Math.sin(Date.now() * 0.008) * 0.3;
             markerRef.current.children[0].scale.set(scale, scale, 1);
             markerRef.current.children[0].lookAt(camera.position);
        }

        // 数据视图热点动画：旋转 + 呼吸
        if (dataOverlayRef.current) {
          dataOverlayRef.current.rotation.y += 0.0025;
          const mat = dataOverlayRef.current.material as THREE.PointsMaterial;
          const t = Date.now() * 0.004;
          mat.opacity = 0.55 + Math.sin(t) * 0.25;
          mat.size = 0.022 + (Math.sin(t) * 0.008);
        }

        // 外部定位动画：缓慢把目标点转到正前方（与手势/鼠标可叠加，但会自动收敛）
        if (targetQuatRef.current) {
          earthGroupRef.current.quaternion.slerp(targetQuatRef.current, 0.08);
          if (earthGroupRef.current.quaternion.angleTo(targetQuatRef.current) < 0.01) {
            earthGroupRef.current.quaternion.copy(targetQuatRef.current);
            targetQuatRef.current = null;
          }
        }

        if (isDragging.current !== lastReportedDragState.current) {
            onControlsUpdate({ isDragging: isDragging.current });
            lastReportedDragState.current = isDragging.current;
        }

        renderer.render(scene, camera);
        requestID = requestAnimationFrame(animate);
      };

      animate();
    };

    // 使用 ResizeObserver，等待容器获得非 0 尺寸后再初始化 Three.js，避免首屏黑屏
    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        if (!initializedRef.current && width > 0 && height > 0) {
          initializedRef.current = true;
          init(width, height);
        }
      });
      resizeObserver.observe(mountNode);

      // 如果一开始就已经有尺寸，直接初始化一次
      const rect = mountNode.getBoundingClientRect();
      if (!initializedRef.current && rect.width > 0 && rect.height > 0) {
        initializedRef.current = true;
        init(rect.width, rect.height);
      }
    } else {
      // 老环境兜底：直接用当前 clientWidth/Height 或窗口尺寸
      const width = mountNode.clientWidth || window.innerWidth;
      const height = mountNode.clientHeight || window.innerHeight;
      initializedRef.current = true;
      init(width, height);
    }

    return () => {
      cancelAnimationFrame(requestID);
      if (resizeObserver && mountNode) {
        resizeObserver.unobserve(mountNode);
        resizeObserver.disconnect();
      }
      if (rendererRef.current && mountNode) {
         mountNode.removeChild(rendererRef.current.domElement);
         rendererRef.current.dispose();
      }
      initializedRef.current = false;
    };
  }, [onControlsUpdate, onReady]);

  // 根据视图图层调整材质和简单数据叠加效果
  useEffect(() => {
    const material = earthMaterialRef.current;
    const grid = gridRef.current;
    const overlay = dataOverlayRef.current;
    if (!material || !grid || !earthGroupRef.current) return;

    const gridMat = grid.material as THREE.LineBasicMaterial;

    if (viewLayer === 'data') {
      material.color.setHex(0x0b1120);
      material.emissive = new THREE.Color(0x22c55e);
      material.emissiveIntensity = 0.2;
      gridMat.opacity = 0.22;
      gridMat.color.setHex(0x22c55e);

      // 构造一个简单的“数据热点”点云叠加（示意用）
      if (!overlay) {
        const pts = new Float32Array(3 * 40);
        for (let i = 0; i < 40; i++) {
          const lat = -60 + Math.random() * 120;
          const lng = -180 + Math.random() * 360;
          const v = latLngToVector3(lat, lng, 1.06);
          pts[i * 3] = v.x;
          pts[i * 3 + 1] = v.y;
          pts[i * 3 + 2] = v.z;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const m = new THREE.PointsMaterial({ color: 0x22c55e, size: 0.03, transparent: true, opacity: 0.85 });
        const points = new THREE.Points(g, m);
        dataOverlayRef.current = points;
        earthGroupRef.current.add(points);
      }
    } else {
      material.color.setHex(0xffffff);
      material.emissive = new THREE.Color(0x000000);
      material.emissiveIntensity = 0;
      gridMat.opacity = 0.08;
      gridMat.color.setHex(0x0ea5e9);

      if (overlay && earthGroupRef.current) {
        earthGroupRef.current.remove(overlay);
        (overlay.geometry as THREE.BufferGeometry).dispose();
        (overlay.material as THREE.Material).dispose();
        dataOverlayRef.current = null;
      }
    }
  }, [viewLayer]);

  // Coordinate Calculation
  const calculateCoords = (point: THREE.Vector3) => {
      if (!earthGroupRef.current) return null;
      
      // Get point in Mesh/Group Local Space
      // Since geometry is rotated -90 Y, this gives us coordinates relative to the rotated space.
      const localPoint = earthGroupRef.current.worldToLocal(point.clone()).normalize();

      // Calculation must be the strict inverse of latLngToVector3 to match borders.
      // latLngToVector3 logic:
      // x = -sin(phi)cos(theta)
      // z = sin(phi)sin(theta)
      // theta = lng + 90
      
      // Inverse:
      // lat = asin(y)
      // tan(theta) = z / -x
      // theta = atan2(z, -x)
      // lng = theta - 90
      
      const lat = Math.asin(localPoint.y) * (180 / Math.PI);
      let lng = (Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI)) - 90;

      // Normalize longitude to -180 to 180
      if (lng < -180) lng += 360;
      if (lng > 180) lng -= 360;

      return {
          lat: Math.round(lat * 100) / 100,
          lng: Math.round(lng * 100) / 100
      };
  };

  const getIntersections = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent | WheelEvent) => {
      if (!mountRef.current || !cameraRef.current || !earthMeshRef.current) return null;

      let clientX, clientY;
      if ('changedTouches' in e) {
          const touches = (e as any).changedTouches;
          clientX = touches[0].clientX;
          clientY = touches[0].clientY;
      } else if ('touches' in e && (e as any).touches.length > 0) {
           const touches = (e as any).touches;
           clientX = touches[0].clientX;
           clientY = touches[0].clientY;
      } else {
          const evt = e as React.MouseEvent;
          clientX = evt.clientX;
          clientY = evt.clientY;
      }
      
      if (clientX === undefined || clientY === undefined) return null;

      const rect = mountRef.current.getBoundingClientRect();
      mouse.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, cameraRef.current);
      return raycaster.current.intersectObject(earthMeshRef.current);
  };

  const handleWheel = (e: React.WheelEvent) => {
      if (!cameraRef.current) return;
      const zoomSpeed = 0.0015;
      const minDistance = 1.25; 
      const maxDistance = 5.0; 
      let newZ = cameraRef.current.position.z + e.deltaY * zoomSpeed;
      newZ = Math.max(minDistance, Math.min(maxDistance, newZ));
      cameraRef.current.position.z = newZ;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    rotationVelocity.current = { x: 0, y: 0 };
    // 一旦用户开始手动拖拽，取消外部定位动画，避免地球自动拉回之前的目标视角
    targetQuatRef.current = null;
    
    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }
    previousMousePosition.current = { x: clientX, y: clientY };
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDragging.current && earthGroupRef.current) {
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const deltaX = clientX - previousMousePosition.current.x;
        const deltaY = clientY - previousMousePosition.current.y;

        rotationVelocity.current = {
            x: deltaY * 0.003,
            y: deltaX * 0.003
        };

        earthGroupRef.current.rotation.y += rotationVelocity.current.y;
        earthGroupRef.current.rotation.x += rotationVelocity.current.x;
        previousMousePosition.current = { x: clientX, y: clientY };
        return; 
    }

    // Hover
    const intersections = getIntersections(e);
    if (intersections && intersections.length > 0) {
        const point = intersections[0].point;
        if (earthMeshRef.current && cursorRef.current && earthGroupRef.current) {
            
            const groupLocalPoint = earthGroupRef.current.worldToLocal(point.clone());
            cursorRef.current.position.copy(groupLocalPoint);
            cursorRef.current.visible = true;

            const now = Date.now();
            // Throttle geo-calculations to 100ms to save performance
            if (now - lastHoverCheckTime.current > 100) {
                const coords = calculateCoords(point);
                if (coords) {
                    let matchedCountryName: string | undefined = undefined;
                    
                    // Check against GeoJSON
                    if (geoJsonData.current) {
                        for (const feature of geoJsonData.current.features) {
                             const geometry = feature.geometry;
                             let isMatch = false;
                             
                             if (geometry.type === 'Polygon') {
                                 isMatch = isPointInPolygon([coords.lng, coords.lat], geometry.coordinates);
                             } else if (geometry.type === 'MultiPolygon') {
                                 // Check each polygon in the multipolygon
                                 for (const polygon of geometry.coordinates) {
                                     if (isPointInPolygon([coords.lng, coords.lat], polygon)) {
                                         isMatch = true;
                                         break;
                                     }
                                 }
                             }

                             if (isMatch) {
                                 matchedCountryName = feature.properties.name;
                                 highlightCountry(feature);
                                 break; 
                             }
                        }
                        
                        // If no match found, clear highlight
                        if (!matchedCountryName) {
                            highlightCountry(null);
                        }
                    }

                    onHover({ coords, country: matchedCountryName });
                }
                lastHoverCheckTime.current = now;
            }
        }
    } else {
        if (cursorRef.current) cursorRef.current.visible = false;
        highlightCountry(null); // Clear highlight on mouse leave
        onHover(null);
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
      if (Math.abs(rotationVelocity.current.x) > 0.002 || Math.abs(rotationVelocity.current.y) > 0.002) {
          return;
      }

      const intersections = getIntersections(e);

      if (intersections && intersections.length > 0) {
          const point = intersections[0].point;
          
          if (earthGroupRef.current && markerRef.current) {
               const groupLocalPoint = earthGroupRef.current.worldToLocal(point.clone());
               markerRef.current.position.copy(groupLocalPoint);
               markerRef.current.visible = true;

               const coords = calculateCoords(point);
               if (coords) onLocationSelect(coords);
          }
      }
  };

  return (
    <div 
        ref={mountRef} 
        className="w-full h-full cursor-crosshair active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={() => { handlePointerUp(); onHover(null); }}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onClick={handleClick}
        onWheel={handleWheel}
    />
  );
};

export default HoloEarth;