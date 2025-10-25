import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://your-supabase-url.supabase.co";
const supabaseKey = "your-anon-key";
const supabase = createClient(supabaseUrl, supabaseKey);

const MAPBOX_TOKEN = "your-mapbox-token";

const Preloader: React.FC = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [mapboxToken, setMapboxToken] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        setMapboxToken(MAPBOX_TOKEN); // Use your hardcoded token

        const { data, error } = await supabase
          .from("campus_locations")
          .select("*");
        if (error) throw error;
        setLocations(data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(120deg, #1b4636 0%, #e5e5e5 100%)", // Mature green to soft gray
        color: "#222",
        fontFamily: "Montserrat, Arial, sans-serif",
      }}
    >
      {/* Nigerian flag - bigger and with subtle shadow */}
      <div
        style={{
          display: "flex",
          marginBottom: 48,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div style={{ width: 80, height: 48, background: "#008753" }} />
        <div style={{ width: 80, height: 48, background: "#fff" }} />
        <div style={{ width: 80, height: 48, background: "#008753" }} />
      </div>
      <h1
        style={{
          fontWeight: 700,
          fontSize: "2.4rem",
          textAlign: "center",
          marginBottom: 20,
          color: "#008753",
          letterSpacing: "1px",
        }}
      >
        Lagos State University Of Education
      </h1>
      <h2
        style={{
          fontWeight: 500,
          fontSize: "1.3rem",
          textAlign: "center",
          marginBottom: 40,
          color: "#333",
        }}
      >
        Location Guide
      </h2>
      <div
        className="loader"
        style={{
          border: "7px solid #e5e5e5",
          borderTop: "7px solid #008753",
          borderRadius: "50%",
          width: 56,
          height: 56,
          animation: "spin 1s linear infinite",
          marginBottom: 32,
        }}
      />
      <style>
        {`
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
      `}
      </style>
      <p
        style={{
          marginTop: 8,
          fontSize: "1.1rem",
          opacity: 0.7,
          color: "#222",
        }}
      >
        Loading, please wait...
      </p>
    </div>
  );
};

export default Preloader;