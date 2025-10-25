import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from "mapbox-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Search, Navigation, MapPin, Building, Coffee, Home, GraduationCap, Users, Dumbbell, FileText, Share2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { renderToStaticMarkup } from 'react-dom/server';
import Supercluster from 'supercluster';

interface CampusLocation {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  description?: string;
}

const categoryColors = {
  academic: 'hsl(var(--campus-blue))',
  'student-services': 'hsl(var(--campus-orange))',
  dining: 'hsl(var(--campus-orange))',
  housing: 'hsl(var(--campus-green))',
  recreation: 'hsl(var(--campus-purple))',
  administrative: 'hsl(var(--campus-blue))',
  services: 'hsl(var(--campus-green))'
};

const categoryIcons = {
  academic: GraduationCap,
  'student-services': Users,
  dining: Coffee,
  housing: Home,
  recreation: Dumbbell,
  administrative: Building,
  services: FileText
};

// Helper to render Lucide icon as SVG string
const renderIconSVG = (IconComponent: React.ComponentType<any>) => {
  if (!IconComponent) return '';
  // Remove Tailwind className, use width/height directly
  const svgString = renderToStaticMarkup(
    <IconComponent width={24} height={24} color="white" stroke="white" fill="none" />
  );
  return svgString;
};

const CampusMap = () => {
  const { toast } = useToast();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<CampusLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLocations, setFilteredLocations] = useState<CampusLocation[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [sharedLocation, setSharedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [supercluster, setSupercluster] = useState<any>(null);
  const [mapBounds, setMapBounds] = useState<number[]>([]);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');

  // Fetch Mapbox token and locations from Supabase
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Mapbox token
        const tokenResponse = await supabase.functions.invoke('get-mapbox-token');
        
        if (tokenResponse.error) {
          console.error('Error fetching token:', tokenResponse.error);
          setShowTokenInput(true);
        } else {
          setMapboxToken(tokenResponse.data.token);
        }

        // Fetch locations
        const { data, error } = await supabase
          .from('campus_locations')
          .select('*');
        
        if (error) throw error;
        setLocations(data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setShowTokenInput(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Get user's current location
  useEffect(() => {
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Optionally handle error
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    }
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Add a blip for the user's location and center map
  useEffect(() => {
    if (map.current && userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      // Create marker wrapper
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';

      // Label
      const label = document.createElement('span');
      label.textContent = 'Me';
      label.style.fontSize = '0.75rem';
      label.style.fontWeight = 'bold';
      label.style.color = '#3b82f6';
      label.style.marginBottom = '2px';

      // Blip
      const userEl = document.createElement('div');
      userEl.style.width = '28px';
      userEl.style.height = '28px';
      userEl.style.borderRadius = '50%';
      userEl.style.background = 'radial-gradient(circle at 10px 10px, #3b82f6 70%, #fff 100%)';
      userEl.style.border = '3px solid #fff';
      userEl.style.boxShadow = '0 2px 8px rgba(59,130,246,0.4)';
      userEl.style.display = 'flex';
      userEl.style.alignItems = 'center';
      userEl.style.justifyContent = 'center';
      userEl.innerHTML = `<svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>`;

      wrapper.appendChild(label);
      wrapper.appendChild(userEl);

      userMarkerRef.current = new mapboxgl.Marker(wrapper)
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current);

      map.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 17,
        essential: true
      });
    }
  }, [userLocation, map.current]);

  // Filter locations based on search and category
  useEffect(() => {
    setFilteredLocations(
      locations.filter(location =>
        location.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (!activeCategory || location.category === activeCategory)
      )
    );
  }, [searchQuery, activeCategory, locations]);

  const initializeMap = (token: string) => {
    if (!mapContainer.current || !token) return;

    mapboxgl.accessToken = token;
    
    // Use user's location as center if available, otherwise use default
    const mapCenter: [number, number] = userLocation ? [userLocation.lng, userLocation.lat] : [-73.9857, 40.7484];
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: mapCenter,
      zoom: userLocation ? 14 : 16,
      pitch: 0,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add markers for all locations
    locations.forEach(location => {
      // Create marker wrapper
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';

      // Label (place name)
      const label = document.createElement('span');
      label.textContent = location.name;
      label.style.fontSize = '1rem';
      label.style.fontWeight = '700';
      label.style.color = '#222';
      label.style.background = 'rgba(255,255,255,0.95)';
      label.style.borderRadius = '10px';
      label.style.padding = '4px 12px';
      label.style.marginBottom = '6px';
      label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
      label.style.maxWidth = '140px';
      label.style.textAlign = 'center';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.letterSpacing = '0.02em';

      // Blip
      const blip = document.createElement('div');
      blip.style.width = '28px';
      blip.style.height = '28px';
      blip.style.borderRadius = '50%';
      blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[location.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
      blip.style.border = '3px solid #fff';
      blip.style.boxShadow = `0 2px 8px ${categoryColors[location.category as keyof typeof categoryColors]}`;
      blip.style.display = 'flex';
      blip.style.alignItems = 'center';
      blip.style.justifyContent = 'center';

      wrapper.appendChild(label);
      wrapper.appendChild(blip);

      const marker = new mapboxgl.Marker(wrapper)
        .setLngLat([location.longitude, location.latitude])
        .addTo(map.current!);

      wrapper.addEventListener('click', () => {
        setSelectedLocation(location);
        map.current?.flyTo({
          center: [location.longitude, location.latitude],
          zoom: 18,
          essential: true
        });
      });

      markersRef.current.push(marker);
    });
  };

  const getIconPath = (iconType: string) => {
    const paths = {
      academic: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 0 5-1 8-1s5 1 8 1v-5",
      dining: "M18 8h1a4 4 0 0 1 0 8h-1 M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z M6 1v3 M10 1v3 M14 1v3",
      housing: "M3 21h18M5 21V7l8-4v18M9 9v2m0 4v2m4-6v2m0 4v2",
      recreation: "M6 2v6h.01L8.5 10.5H15A3.5 3.5 0 0 1 11.5 18v.01H9V22h6v-3.99h.01L17.5 15.5H21V2H6z",
      administrative: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18H6zm4-10v2m0 4v2m4-6v2m0 4v2",
      services: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
      'student-services': "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
    };
    return paths[iconType as keyof typeof paths] || paths.academic;
  };

  const handleLocationClick = (location: CampusLocation) => {
    setSelectedLocation(location);
    map.current?.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 18,
      essential: true
    });
  };

  const handleTokenSubmit = () => {
    if (mapboxToken.trim()) {
      setShowTokenInput(false);
      initializeMap(mapboxToken);
    }
  };

  const drawRoute = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    if (!map.current || !mapboxToken) return;

    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&access_token=${mapboxToken}`;

    fetch(directionsUrl)
      .then(response => response.json())
      .then(data => {
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];

          // Remove existing route layer if it exists
          if (map.current.getLayer('route')) {
            map.current.removeLayer('route');
          }
          if (map.current.getSource('route')) {
            map.current.removeSource('route');
          }

          // Add the route to the map
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: route.geometry
            }
          });

          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3b82f6', // Tailwind blue
              'line-width': 6,
              'line-opacity': 0.8
            }
          });

          // Fit the map to show the entire route
          const coordinates = route.geometry.coordinates;
          const bounds = coordinates.reduce((bounds: any, coord: any) => {
            return bounds.extend(coord);
          }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

          map.current.fitBounds(bounds, {
            padding: 50
          });
        }
      })
      .catch(error => {
        console.error('Directions error:', error);
      });
  };

  const handleGetDirections = async (location: CampusLocation) => {
    if (userLocation && map.current) {
      drawRoute(userLocation, { lat: location.latitude, lng: location.longitude });

      // Get travel times for all modes
      const times = await getTravelTimes(userLocation, { lat: location.latitude, lng: location.longitude });

      // Show a toast with the travel times
      if (times) {
        toast({
          title: "Estimated Travel Times",
          description: times.map(t => `${t.label}: ${t.duration !== null ? `${t.duration} min` : 'N/A'}`).join(" | "),
          duration: 7000
        });
      }
    } else {
      // Fallback to opening in external map app
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}&travelmode=driving`;
      window.open(googleMapsUrl, '_blank');
      toast({
        title: "Directions",
        description: "Opening directions in Google Maps",
        duration: 3000
      });
    }
  };

  const handleShareLocation = async (location: CampusLocation) => {
    const locationUrl = `https://www.google.com/maps/place/${location.latitude},${location.longitude}`;
    const shareData = {
      title: location.name,
      text: `Check out ${location.name} - ${location.description}`,
      url: locationUrl
    };

    try {
      // Try using Web Share API first (mobile devices)
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast({
          title: "Location Shared",
          description: "Location shared successfully",
          duration: 3000
        });
      } else {
        // Fallback to copying to clipboard
        const shareText = `${location.name}\n${location.description}\nLocation: ${locationUrl}`;
        await navigator.clipboard.writeText(shareText);
        toast({
          title: "Location Copied",
          description: "Location details copied to clipboard",
          duration: 3000
        });
      }
    } catch (error) {
      console.error('Share error:', error);
      // Final fallback - show the URL
      toast({
        title: "Share Location",
        description: `Location: ${locationUrl}`,
        duration: 5000
      });
    }
  };

  const handleShareMyLocation = async () => {
    if (!userLocation) return;

    // Generate a shareable URL with your coordinates as query params
    const shareUrl = `${window.location.origin}${window.location.pathname}?sharedLat=${userLocation.lat}&sharedLng=${userLocation.lng}`;

    const shareData = {
      title: "My Campus Location",
      text: "Here's my current location on the campus map!",
      url: shareUrl
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast({
          title: "Location Shared",
          description: "Location shared successfully",
          duration: 3000
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Location Copied",
          description: "Shareable link copied to clipboard",
          duration: 3000
        });
      }
    } catch (error) {
      toast({
        title: "Share Error",
        description: "Could not share location.",
        duration: 3000
      });
    }
  };

  const getTravelTimes = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    if (!mapboxToken) return null;

    const modes = [
      { profile: "walking", label: "Walk" },
      { profile: "cycling", label: "Cycle" },
      { profile: "driving", label: "Drive" }
    ];

    const results: { label: string; duration: number | null }[] = [];

    for (const mode of modes) {
      const url = `https://api.mapbox.com/directions/v5/mapbox/${mode.profile}/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&access_token=${mapboxToken}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          results.push({
            label: mode.label,
            duration: Math.round(data.routes[0].duration / 60) // minutes
          });
        } else {
          results.push({ label: mode.label, duration: null });
        }
      } catch {
        results.push({ label: mode.label, duration: null });
      }
    }

    return results;
  };

  // Initialize map when token and locations are loaded
  useEffect(() => {
    if (!loading && !showTokenInput && mapboxToken && locations.length > 0) {
      if (!map.current) {
        initializeMap(mapboxToken);
      } else {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      // Add new markers
      locations.forEach(location => {
        // Create marker wrapper
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';

        // Label (place name)
        const label = document.createElement('span');
        label.textContent = location.name;
        label.style.fontSize = '1rem';
        label.style.fontWeight = '700';
        label.style.color = '#222';
        label.style.background = 'rgba(255,255,255,0.95)';
        label.style.borderRadius = '10px';
        label.style.padding = '4px 12px';
        label.style.marginBottom = '6px';
        label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
        label.style.maxWidth = '140px';
        label.style.textAlign = 'center';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.letterSpacing = '0.02em';

        // Blip
        const blip = document.createElement('div');
        blip.style.width = '28px';
        blip.style.height = '28px';
        blip.style.borderRadius = '50%';
        blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[location.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
        blip.style.border = '3px solid #fff';
        blip.style.boxShadow = `0 2px 8px ${categoryColors[location.category as keyof typeof categoryColors]}`;
        blip.style.display = 'flex';
        blip.style.alignItems = 'center';
        blip.style.justifyContent = 'center';

        wrapper.appendChild(label);
        wrapper.appendChild(blip);

        const marker = new mapboxgl.Marker(wrapper)
          .setLngLat([location.longitude, location.latitude])
          .addTo(map.current!);

        wrapper.addEventListener('click', () => {
          setSelectedLocation(location);
          map.current?.flyTo({
            center: [location.longitude, location.latitude],
            zoom: 18,
            essential: true
          });
        });

        markersRef.current.push(marker);
      });
      }
    }
  }, [loading, locations, showTokenInput, mapboxToken]);

  const getCategoryInitial = (category: string) => {
    const initials: Record<string, string> = {
      academic: "A",
      "student-services": "SS",
      dining: "D",
      housing: "H",
      recreation: "R",
      administrative: "AS",
      services: "S"
    };
    return initials[category] || "?";
  };

  // Handle shared location from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("sharedLat");
    const lng = params.get("sharedLng");
    if (lat && lng) {
      setSharedLocation({ lat: parseFloat(lat), lng: parseFloat(lng) });
    }
  }, []);

  // Effect to show shared location on map
  useEffect(() => {
    if (map.current && sharedLocation) {
      const sharedEl = document.createElement('div');
      sharedEl.style.width = '28px';
      sharedEl.style.height = '28px';
      sharedEl.style.borderRadius = '50%';
      sharedEl.style.background = 'radial-gradient(circle at 10px 10px, #16a34a 70%, #fff 100%)'; // green
      sharedEl.style.border = '3px solid #fff';
      sharedEl.style.boxShadow = '0 2px 8px rgba(22,163,74,0.4)';
      sharedEl.style.display = 'flex';
      sharedEl.style.alignItems = 'center';
      sharedEl.style.justifyContent = 'center';
      sharedEl.innerHTML = `<svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>`;

      new mapboxgl.Marker(sharedEl)
        .setLngLat([sharedLocation.lng, sharedLocation.lat])
        .setPopup(new mapboxgl.Popup().setText("Friend's Location"))
        .addTo(map.current);

      // Fit map to show both locations
      if (userLocation) {
        const bounds = new mapboxgl.LngLatBounds(
          [userLocation.lng, userLocation.lat],
          [sharedLocation.lng, sharedLocation.lat]
        );
        map.current.fitBounds(bounds, { padding: 80 });
      } else {
        map.current.flyTo({
          center: [sharedLocation.lng, sharedLocation.lat],
          zoom: 17,
          essential: true
        });
      }
    }
  }, [sharedLocation, userLocation]);

  // Clustering effect
  useEffect(() => {
    if (locations.length > 0) {
      const points = locations.map(location => ({
        type: "Feature" as const,
        properties: {
          cluster: false,
          locationId: location.id,
          category: location.category,
          name: location.name
        },
        geometry: {
          type: "Point" as const,
          coordinates: [location.longitude, location.latitude]
        }
      }));

      const cluster = new Supercluster({
        radius: 40,
        maxZoom: 18
      });
      cluster.load(points);
      setSupercluster(cluster);
    }
  }, [locations]);

  // Update map bounds on move
  useEffect(() => {
    if (map.current && supercluster) {
      map.current.on('moveend', () => {
        const bounds = map.current!.getBounds();
        setMapBounds([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth()
        ]);
      });
      // Initial bounds
      const bounds = map.current.getBounds();
      setMapBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ]);
    }
  }, [supercluster]);

  // Update clusters on map move
  useEffect(() => {
    if (!map.current || !supercluster || !mapBounds.length) return;

    // Remove old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const zoom = map.current.getZoom();
    const clusters = supercluster.getClusters(mapBounds, Math.round(zoom));
    setClusters(clusters);

    clusters.forEach(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      if (cluster.properties.cluster) {
        // Cluster marker
        const count = cluster.properties.point_count;
        const clusterEl = document.createElement('div');
        clusterEl.style.width = '40px';
        clusterEl.style.height = '40px';
        clusterEl.style.borderRadius = '50%';
        clusterEl.style.background = '#6366f1';
        clusterEl.style.display = 'flex';
        clusterEl.style.alignItems = 'center';
        clusterEl.style.justifyContent = 'center';
        clusterEl.style.color = 'white';
        clusterEl.style.fontWeight = 'bold';
        clusterEl.style.fontSize = '1rem';
        clusterEl.textContent = count;

        const marker = new mapboxgl.Marker(clusterEl)
          .setLngLat([lng, lat])
          .addTo(map.current!);

        clusterEl.addEventListener('click', () => {
          const expansionZoom = Math.min(
            supercluster.getClusterExpansionZoom(cluster.properties.cluster_id),
            18
          );
          map.current!.flyTo({ center: [lng, lat], zoom: expansionZoom });
        });

        markersRef.current.push(marker);
      } else {
        // Single location marker (same as your blip + label)
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';

        const label = document.createElement('span');
        label.textContent = cluster.properties.name;
        label.style.fontSize = '1rem';
        label.style.fontWeight = '700';
        label.style.color = '#222';
        label.style.background = 'rgba(255,255,255,0.95)';
        label.style.borderRadius = '10px';
        label.style.padding = '4px 12px';
        label.style.marginBottom = '6px';
        label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
        label.style.maxWidth = '140px';
        label.style.textAlign = 'center';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.letterSpacing = '0.02em';

        const blip = document.createElement('div');
        blip.style.width = '28px';
        blip.style.height = '28px';
        blip.style.borderRadius = '50%';
        blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[cluster.properties.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
        blip.style.border = '3px solid #fff';
        blip.style.boxShadow = `0 2px 8px ${categoryColors[cluster.properties.category as keyof typeof categoryColors]}`;
        blip.style.display = 'flex';
        blip.style.alignItems = 'center';
        blip.style.justifyContent = 'center';

        wrapper.appendChild(label);
        wrapper.appendChild(blip);

        const marker = new mapboxgl.Marker(wrapper)
          .setLngLat([lng, lat])
          .addTo(map.current!);

        wrapper.addEventListener('click', () => {
          setSelectedLocation(locations.find(l => l.id === cluster.properties.locationId)!);
          map.current?.flyTo({
            center: [lng, lat],
            zoom: 18,
            essential: true
          });
        });

        markersRef.current.push(marker);
      }
    });
  }, [supercluster, mapBounds, locations]);

  // Update map style
  useEffect(() => {
    if (map.current) {
      map.current.setStyle(mapStyle);
    }
  }, [mapStyle]);

  if (showTokenInput) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <MapPin className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">Campus Map Setup</h2>
              <p className="text-muted-foreground">Enter your Mapbox public token to initialize the campus map</p>
            </div>
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="Mapbox Public Token"
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                className="w-full"
              />
              <Button 
                onClick={handleTokenSubmit}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white font-medium"
                disabled={!mapboxToken.trim()}
              >
                Initialize Campus Map
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Get your token at{" "}
                <a href="https://mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  mapbox.com
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[400px] h-screen sm:h-[calc(100vh-0px)] bg-background">
      {/* Search and Controls */}
      <div className="absolute top-4 left-2 right-2 sm:left-4 sm:right-4 z-10 space-y-4">
        <Card className="p-4 bg-card/95 backdrop-blur-sm border-border/50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                variant="search"
                placeholder="Search campus locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 py-2 rounded-lg border border-border bg-white/80 shadow focus:ring-2 focus:ring-primary transition"
                aria-label="Search campus locations"
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-destructive transition"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  type="button"
                >
                  ×
                </button>
              )}
            </div> 
            
            <div className="flex gap-2 flex-wrap">
              
            <Button
          size="sm"
          variant={mapStyle === 'mapbox://styles/mapbox/streets-v12' ? 'default' : 'outline'}
          onClick={() => setMapStyle('mapbox://styles/mapbox/streets-v12')}
        >
          Street
        </Button>
        <Button
          size="sm"
          variant={mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12' ? 'default' : 'outline'}
          onClick={() => setMapStyle('mapbox://styles/mapbox/satellite-streets-v12')}
        >
          Satellite
        </Button>
        <Button
          size="sm"
          variant={mapStyle === 'mapbox://styles/mapbox/dark-v11' ? 'default' : 'outline'}
          onClick={() => setMapStyle('mapbox://styles/mapbox/dark-v11')}
        >
          Dark
        </Button>
            </div>
          </div>
        </Card>

        {/* Search Results */}
        {searchQuery && (
          <Card className="p-2 bg-white/95 backdrop-blur border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto mt-2">
            {filteredLocations.length > 0 ? (
              <div className="space-y-1">
                {filteredLocations.map(location => (
                  <div
                    key={location.id}
                    className="p-3 rounded-lg hover:bg-primary/10 cursor-pointer transition-colors"
                    onClick={() => handleLocationClick(location)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            background: categoryColors[location.category as keyof typeof categoryColors],
                            borderRadius: '50%',
                            padding: '4px'
                          }}
                        >
                          {/* Initials instead of icons */}
                          <span className="text-white font-bold text-sm">
                            {getCategoryInitial(location.category)}
                          </span>
                        </span>
                        <div>
                          <h4 className="font-semibold">{location.name}</h4>
                          <p className="text-xs text-muted-foreground">{location.description}</p>
                        </div>
                      </div>
                      <Badge 
                        style={{ backgroundColor: categoryColors[location.category as keyof typeof categoryColors] }}
                        className="text-white"
                      >
                        {location.category}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No locations found</p>
            )}
          </Card>
        )}
      </div>

      {/* Location Details Panel */}
      {selectedLocation && (
        <div className="absolute bottom-4 left-2 right-2 sm:left-4 sm:right-auto sm:w-80 w-full z-10">
          <Card className="p-4 bg-card/95 backdrop-blur-sm border-border/50">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                {categoryIcons[selectedLocation.category as keyof typeof categoryIcons] && (
                  <span
                    style={{
                      background: categoryColors[selectedLocation.category as keyof typeof categoryColors],
                      borderRadius: '50%',
                      padding: '6px'
                    }}
                  >
                    {React.createElement(categoryIcons[selectedLocation.category as keyof typeof categoryIcons], {
                      className: "w-5 h-5 text-white"
                    })}
                  </span>
                )}
                <div>
                  <h3 className="font-bold text-lg">{selectedLocation.name}</h3>
                  <Badge 
                    style={{ backgroundColor: categoryColors[selectedLocation.category as keyof typeof categoryColors] }}
                    className="text-white mt-1"
                  >
                    {selectedLocation.category}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLocation(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </Button>
            </div>
            <p className="text-muted-foreground mb-4">{selectedLocation.description}</p>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="bg-gradient-to-r from-primary to-secondary"
                onClick={() => handleGetDirections(selectedLocation)}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Get Directions
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleShareLocation(selectedLocation)}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Location
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Legend for Categories (bottom-left, dismissable) */}
      {showLegend && (
        <div className="absolute bottom-4 left-2 sm:left-4 z-20 bg-white/90 rounded-lg shadow p-3 flex gap-4 flex-wrap items-center">
          {Object.entries(categoryIcons).map(([cat, Icon]) => (
            <div key={cat} className="flex items-center gap-1">
              <span style={{
                background: categoryColors[cat as keyof typeof categoryColors],
                borderRadius: '50%',
                padding: '4px'
              }}>
                <Icon className="w-4 h-4 text-white" />
              </span>
              <span className="text-xs">{cat.replace('-', ' ')}</span>
            </div>
          ))}
          <button
            className="ml-2 px-2 py-1 rounded text-xs bg-muted-foreground text-white hover:bg-destructive transition"
            onClick={() => setShowLegend(false)}
            aria-label="Dismiss legend"
          >
            ×
          </button>
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full rounded-lg" />

      {/* Locate Me Button */}
      <button
        className="fixed bottom-6 right-4 sm:right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg p-3 flex items-center gap-2 transition"
        onClick={() => {
          if (userLocation && map.current) {
            map.current.flyTo({
              center: [userLocation.lng, userLocation.lat],
              zoom: 17,
              essential: true
            });
          }
        }}
        aria-label="Locate Me"
      >
        <Navigation className="w-5 h-5" />
      </button>
      <Button
        className="fixed bottom-20 right-4 sm:right-6 z-50 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg p-3 flex items-center gap-2 transition"
        onClick={handleShareMyLocation}
        aria-label="Share My Location"
      >
        <Share2 className="w-5 h-5" />
        Share My Location
      </Button>

     
    </div>
  );
};

export default CampusMap;