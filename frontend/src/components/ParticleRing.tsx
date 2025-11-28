'use client'

import React, { useRef, useEffect } from "react";

const ParticleRing = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    let THREE: any;

    const init = async () => {
      // Dynamically import Three.js
      THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const container = containerRef.current;
      if (!container) return;

      // Scene setup
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Camera setup
      const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.set(10, -7.5, -5);
      cameraRef.current = camera;

      // Renderer setup
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(0x000000, 0); // Transparent background
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.zoomSpeed = 0.6;
      controls.panSpeed = 0.5;
      controls.rotateSpeed = 0.4;
      controls.maxDistance = 20;
      controls.minDistance = 10;

      // Lights
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      scene.add(directionalLight);

      const pointLight = new THREE.PointLight(0xffffff, 10);
      pointLight.position.set(-30, 0, -30);
      scene.add(pointLight);

      // Create particle group
      const group = new THREE.Group();
      groupRef.current = group;
      scene.add(group);

      // Generate points
      const MIN_RADIUS = 7.5;
      const MAX_RADIUS = 15;
      const DEPTH = 2;
      const LEFT_COLOR = "e8d5a3"; // Soft Cream/Beige
      const RIGHT_COLOR = "d4b896"; // Muted Warm Gold
      const NUM_POINTS = 2500;

      const getGradientStop = (ratio: number) => {
        ratio = ratio > 1 ? 1 : ratio < 0 ? 0 : ratio;
        const c0 = LEFT_COLOR.match(/.{1,2}/g)!.map(
          (oct) => parseInt(oct, 16) * (1 - ratio)
        );
        const c1 = RIGHT_COLOR.match(/.{1,2}/g)!.map(
          (oct) => parseInt(oct, 16) * ratio
        );
        const ci = [0, 1, 2].map((i) => Math.min(Math.round(c0[i] + c1[i]), 255));
        const color = ci.reduce((a, v) => (a << 8) + v, 0).toString(16).padStart(6, "0");
        return `#${color}`;
      };

      const calculateColor = (x: number) => {
        const maxDiff = MAX_RADIUS * 2;
        const distance = x + MAX_RADIUS;
        const ratio = distance / maxDiff;
        return getGradientStop(ratio);
      };

      const randomFromInterval = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      // Create spheres for inner points
      const sphereGeometry = new THREE.SphereGeometry(0.1, 10, 10);

      for (let i = 0; i < NUM_POINTS; i++) {
        const randomRadius = randomFromInterval(MIN_RADIUS, MAX_RADIUS);
        const randomAngle = Math.random() * Math.PI * 2;
        const x = Math.cos(randomAngle) * randomRadius;
        const y = Math.sin(randomAngle) * randomRadius;
        const z = randomFromInterval(-DEPTH, DEPTH);
        const color = calculateColor(x);

        const material = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.8,
          roughness: 0.3,
        });

        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(x, y, z);
        group.add(sphere);
      }

      // Create outer points
      for (let i = 0; i < NUM_POINTS / 4; i++) {
        const randomRadius = randomFromInterval(MIN_RADIUS / 2, MAX_RADIUS * 2);
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * randomRadius;
        const y = Math.sin(angle) * randomRadius;
        const z = randomFromInterval(-DEPTH * 10, DEPTH * 10);
        const color = calculateColor(x);

        const material = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.8,
          roughness: 0.3,
        });

        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(x, y, z);
        group.add(sphere);
      }

      // Animation loop
      let clock = new THREE.Clock();

      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();

        // Rotate the particle group
        if (group) {
          group.rotation.z = elapsed * 0.05;
        }

        controls.update();
        renderer.render(scene, camera);
      };

      animate();

      // Handle resize
      const handleResize = () => {
        if (!container || !camera || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    };

    init();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: 'transparent' }}
    />
  );
};

export default ParticleRing;
