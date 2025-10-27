import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from "mapbox-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Search, Navigation, MapPin, Building, Coffee, Home, GraduationCap, Users, Dumbbell, FileText, Share2, Copy, Plus, X, HelpCircle, List } from 'lucide-react';
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
  // When true the map will follow/center on the user's location updates.
  // Set to false when the user interacts with the map (pan/zoom) so we stop
  // forcing the viewport.
  const [followUser, setFollowUser] = useState(true);
  const followRef = useRef(followUser);
  useEffect(() => { followRef.current = followUser; }, [followUser]);
  // Legend is hidden by default; it will render only when the user toggles it
  const [showLegend, setShowLegend] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [sharedLocation, setSharedLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Tutorial / onboarding modal
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialSteps = [
    {
      title: 'Search locations',
      description: 'Use the search box to find campus locations by name. Tap a result to center the map on it and open details.'
    },
    {
      title: 'Map styles',
      description: 'Switch between Street, Satellite and Dark map styles using the buttons in the top-right control card.'
    },
    {
      title: 'Legend',
      description: 'Toggle the legend to see category colors and icons. On mobile it appears near the top to avoid action buttons.'
    },
    {
      title: 'Locate & follow',
      description: 'Tap the Locate button (FAB) to re-center the map on your position and enable following. Pan or zoom to disable following.'
    },
    {
      title: 'Share & feedback',
      description: 'Use the FAB to share your location or send feedback via the feedback form.'
    },
    {
      title: 'Directions & routing',
      description: 'Open a location and tap Get Directions to draw a route from your location, or open directions in an external maps app.'
    },
    {
      title: 'Clusters & markers',
      description: 'Markers are clustered at certain zoom levels; tap a cluster to zoom in and expand it.'
    }
  ];
  
  // Features panel (current and upcoming)
  const [showFeatures, setShowFeatures] = useState(false);

  const currentFeatures = [
    'Search campus locations and view details',
    'Map styles: Street / Satellite / Dark',
    'Markers, clustering and cluster expansion',
    'User location marker and Locate/follow functionality',
    'Share a location or your current location (Web Share / Clipboard)',
    'Get directions and draw routes using Mapbox Directions',
    'Feedback form (send feedback)',
    'Mapbox token input and Supabase-backed token fetch',
    'Collapsible FAB for quick actions',
    'Responsive marker sizing and clustering on mobile',
    'In-app tutorial modal'
  ];

  const upcomingFeatures = [
    'Save favorite places and quick access list',
    'Turn-by-turn walking navigation (in-app)',
    'Offline map tiles / caching for limited connectivity',
    'Indoor floor plans and building interiors',
    'Multi-stop route planning',
    'Public transit routing overlay',
    'User accounts and bookmarks',
    'Accessibility filters (ramps, elevators)',
    'Shareable annotated snapshots of the map',
    'Real-time friend tracking (opt-in)'
  ];
  const [clusters, setClusters] = useState<any[]>([]);
  const [supercluster, setSupercluster] = useState<any>(null);
  const [mapBounds, setMapBounds] = useState<number[]>([]);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  // Responsive flag to tune marker/cluster behavior on small screens
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ensure Mapbox resizes to the container whenever the viewport changes or
  // when UI toggles that might overlay the map change (fabOpen/isMobile).
  useEffect(() => {
    const onWindowResize = () => {
      try { map.current?.resize(); } catch (e) { /* ignore */ }
    };

    // Resize when window changes
    window.addEventListener('resize', onWindowResize);

    // Also trigger a resize when mobile state or fab open state changes
    try { map.current?.resize(); } catch (e) { /* ignore */ }

    return () => {
      window.removeEventListener('resize', onWindowResize);
    };
  }, [isMobile, fabOpen]);

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
      // If we already have a marker, just update its position to avoid
      // recreating DOM nodes repeatedly (and losing any event listeners).
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      } else {
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
      }

      // Only recenter the map if the user hasn't manually interacted with it.
      // This prevents continuous re-centering on mobile while the user is
      // trying to explore other areas of the map.
      if (followRef.current) {
        map.current.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 17,
          essential: true
        });
      }
    }
  }, [userLocation]);

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

  // When the user interacts with the map (pan/zoom/touch), stop following
  // their location so they can explore the map without being forced back.
  map.current.on('dragstart', () => setFollowUser(false));
  map.current.on('zoomstart', () => setFollowUser(false));
  map.current.on('rotatestart', () => setFollowUser(false));
  map.current.on('touchstart', () => setFollowUser(false));

    // Add markers for all locations
    locations.forEach(location => {
      // Create marker wrapper
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';

  // Label (place name) — hide on mobile to reduce clutter
  const label = document.createElement('span');
  label.textContent = location.name;
  label.style.fontSize = isMobile ? '0.85rem' : '1rem';
  label.style.fontWeight = '700';
  label.style.color = '#222';
  label.style.background = 'rgba(255,255,255,0.95)';
  label.style.borderRadius = '10px';
  label.style.padding = isMobile ? '2px 8px' : '4px 12px';
  label.style.marginBottom = '6px';
  label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
  label.style.maxWidth = isMobile ? '100px' : '140px';
  label.style.textAlign = 'center';
  label.style.whiteSpace = 'nowrap';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.letterSpacing = '0.02em';

  // Blip
  const blip = document.createElement('div');
  const blipSize = isMobile ? 20 : 28;
  blip.style.width = `${blipSize}px`;
  blip.style.height = `${blipSize}px`;
  blip.style.borderRadius = '50%';
  blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[location.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
  blip.style.border = '3px solid #fff';
  blip.style.boxShadow = `0 2px 8px ${categoryColors[location.category as keyof typeof categoryColors]}`;
  blip.style.display = 'flex';
  blip.style.alignItems = 'center';
  blip.style.justifyContent = 'center';

  if (!isMobile) wrapper.appendChild(label);
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

  // Label (place name) — hide on mobile to reduce clutter
  const label = document.createElement('span');
  label.textContent = location.name;
  label.style.fontSize = isMobile ? '0.85rem' : '1rem';
  label.style.fontWeight = '700';
  label.style.color = '#222';
  label.style.background = 'rgba(255,255,255,0.95)';
  label.style.borderRadius = '10px';
  label.style.padding = isMobile ? '2px 8px' : '4px 12px';
  label.style.marginBottom = '6px';
  label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
  label.style.maxWidth = isMobile ? '100px' : '140px';
  label.style.textAlign = 'center';
  label.style.whiteSpace = 'nowrap';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.letterSpacing = '0.02em';

  // Blip
  const blip = document.createElement('div');
  const blipSize = isMobile ? 20 : 28;
  blip.style.width = `${blipSize}px`;
  blip.style.height = `${blipSize}px`;
  blip.style.borderRadius = '50%';
  blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[location.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
  blip.style.border = '3px solid #fff';
  blip.style.boxShadow = `0 2px 8px ${categoryColors[location.category as keyof typeof categoryColors]}`;
  blip.style.display = 'flex';
  blip.style.alignItems = 'center';
  blip.style.justifyContent = 'center';

  if (!isMobile) wrapper.appendChild(label);
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
        // Use a smaller radius on mobile so clustering is less aggressive
        // and users can see individual markers more easily.
        radius: isMobile ? 20 : 40,
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
  const clusterSize = isMobile ? 30 : 40;
  clusterEl.style.width = `${clusterSize}px`;
  clusterEl.style.height = `${clusterSize}px`;
  clusterEl.style.borderRadius = '50%';
  clusterEl.style.background = '#6366f1';
  clusterEl.style.display = 'flex';
  clusterEl.style.alignItems = 'center';
  clusterEl.style.justifyContent = 'center';
  clusterEl.style.color = 'white';
  clusterEl.style.fontWeight = 'bold';
  clusterEl.style.fontSize = isMobile ? '0.9rem' : '1rem';
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
  label.style.fontSize = isMobile ? '0.85rem' : '1rem';
  label.style.fontWeight = '700';
  label.style.color = '#222';
  label.style.background = 'rgba(255,255,255,0.95)';
  label.style.borderRadius = '10px';
  label.style.padding = isMobile ? '2px 8px' : '4px 12px';
  label.style.marginBottom = '6px';
  label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
  label.style.maxWidth = isMobile ? '100px' : '140px';
  label.style.textAlign = 'center';
  label.style.whiteSpace = 'nowrap';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.letterSpacing = '0.02em';

  const blip = document.createElement('div');
  const blipSize = isMobile ? 20 : 28;
  blip.style.width = `${blipSize}px`;
  blip.style.height = `${blipSize}px`;
  blip.style.borderRadius = '50%';
  blip.style.background = `radial-gradient(circle at 10px 10px, ${categoryColors[cluster.properties.category as keyof typeof categoryColors]} 70%, #fff 100%)`;
  blip.style.border = '3px solid #fff';
  blip.style.boxShadow = `0 2px 8px ${categoryColors[cluster.properties.category as keyof typeof categoryColors]}`;
  blip.style.display = 'flex';
  blip.style.alignItems = 'center';
  blip.style.justifyContent = 'center';

  if (!isMobile) wrapper.appendChild(label);
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

            {/* Legend toggle button */}
            <Button
              size="sm"
              variant={showLegend ? 'default' : 'outline'}
              onClick={() => setShowLegend(prev => !prev)}
              aria-pressed={showLegend}
              title={showLegend ? 'Hide legend' : 'Show legend'}
            >
              {showLegend ? 'Hide Legend' : 'Legend'}
            </Button>
            {/* Tutorial / Help button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowTutorial(true); setTutorialStep(0); }}
              title="Show tutorial"
              aria-label="Show tutorial"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help
            </Button>
            {/* Features toggle button */}
            <Button
              size="sm"
              variant={showFeatures ? 'default' : 'outline'}
              onClick={() => setShowFeatures(s => !s)}
              aria-pressed={showFeatures}
              title="Show features"
            >
              <List className="w-4 h-4 mr-2" />
              Features
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
        {/* Features Panel (current & upcoming) */}
        {showFeatures && (
          <Card className="p-4 bg-white/95 backdrop-blur border border-border rounded-lg shadow-lg mt-2 max-h-72 overflow-y-auto">
            <h4 className="font-semibold mb-2">Current features</h4>
            <ul className="list-disc list-inside text-sm mb-3">
              {currentFeatures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <h4 className="font-semibold mb-2">Planned / upcoming</h4>
            <ul className="list-disc list-inside text-sm mb-2">
              {upcomingFeatures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowFeatures(false)}>Close</Button>
            </div>
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

      {/* Legend for Categories (responsive: moved on mobile to avoid overlapping floating buttons) */}
      {showLegend && (
        <div className="absolute z-20 bg-white/90 rounded-lg shadow p-3 flex gap-4 flex-wrap items-center"
             style={{
               // On mobile, position legend near the top so it doesn't collide with the action buttons
               bottom: isMobile ? undefined : '1rem',
               left: '0.5rem',
               top: isMobile ? '4.5rem' : undefined,
               right: isMobile ? '0.5rem' : undefined,
             }}
        >
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

      {/* Map Container — fill the full available viewport. We removed the
          mobile bottom inset so the map renders at full height. Floating
          controls will overlay the map instead of shrinking it.
      */}
      <div
        ref={mapContainer}
        className="absolute inset-0 rounded-lg"
        style={{ minHeight: '100vh' }}
      />

      {/* Floating action buttons (stacked) — grouped to avoid overlap on mobile */}
          <div className="fixed z-50 right-4 sm:right-6 bottom-6 flex flex-col items-end" role="group" aria-label="Map actions">
            {/* Collapsible FAB: main toggle */}
            <div className="flex flex-col items-end">
              {/* Action buttons — appear above the main FAB when open */}
              <div id="fab-actions" className={`flex flex-col items-end mb-2 space-y-2 transition-all duration-200 ${fabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg p-3 flex items-center gap-2 transition transform"
                  onClick={() => {
                    if (userLocation && map.current) {
                      setFollowUser(true);
                      map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 17, essential: true });
                    }
                  }}
                  aria-label="Locate Me"
                  title="Locate Me"
                >
                  <Navigation className="w-5 h-5" />
                </button>

                <button
                  className="bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg p-3 flex items-center gap-2 transition"
                  onClick={handleShareMyLocation}
                  aria-label="Share My Location"
                  title="Share My Location"
                >
                  <Share2 className="w-5 h-5" />
                </button>

                <button
                  className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-lg p-3 transition"
                  onClick={() => setShowFeedback(true)}
                  aria-label="Feedback"
                  title="Send Feedback"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h16M3 7l9 7 9-7M4 7h16M4 17h16" />
                  </svg>
                </button>
              </div>

              {/* Main FAB toggle */}
              <button
                className="bg-primary text-white rounded-full shadow-lg p-3 transition-transform transform hover:scale-105 flex items-center justify-center"
                onClick={() => setFabOpen(open => !open)}
                aria-expanded={fabOpen}
                aria-controls="fab-actions"
                title={fabOpen ? 'Close actions' : 'Open actions'}
              >
                {fabOpen ? <X className="w-5 h-5 text-white" /> : <Plus className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>

      {/* Feedback Form (modal or popup) */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-4">
            <CardContent>
              <h3 className="text-lg font-semibold mb-2">Send Feedback</h3>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="w-full p-2 text-sm rounded-md border focus:ring-1 focus:ring-primary focus:outline-none resize-none h-24"
                placeholder="Enter your feedback here..."
                aria-label="Feedback message"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowFeedback(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  className="bg-yellow-500 hover:bg-yellow-600 text-white"
                  onClick={async () => {
                    try {
                      const res = await fetch('https://formspree.io/f/movpakoq', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: feedbackText })
                      });
                      if (res.ok) {
                        toast({
                          title: "Feedback Sent",
                          description: "Thank you for your feedback!",
                          duration: 4000
                        });
                        setShowFeedback(false);
                        setFeedbackText('');
                      } else {
                        toast({
                          title: "Error",
                          description: "Failed to send feedback.",
                          duration: 4000
                        });
                      }
                    } catch {
                      toast({
                        title: "Error",
                        description: "Failed to send feedback.",
                        duration: 4000
                      });
                    }
                  }}
                  disabled={!feedbackText.trim()}
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-4">
            <CardContent>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold">{tutorialSteps[tutorialStep].title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{tutorialSteps[tutorialStep].description}</p>
                </div>
                <div className="ml-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowTutorial(false)} aria-label="Close tutorial">
                    Close
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <Button variant="outline" size="sm" onClick={() => setTutorialStep(s => Math.max(0, s - 1))} disabled={tutorialStep === 0}>
                    Previous
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">{tutorialStep + 1} / {tutorialSteps.length}</div>
                <div>
                  <Button size="sm" onClick={() => {
                    if (tutorialStep < tutorialSteps.length - 1) setTutorialStep(s => s + 1);
                    else setShowTutorial(false);
                  }}>{tutorialStep < tutorialSteps.length - 1 ? 'Next' : 'Done'}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CampusMap;