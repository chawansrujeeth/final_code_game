import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

function getDirectImageUrl(url) {
  // Convert Google Drive view links to direct image links
  const match = url.match(/https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\//);
  if (match) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
}

export default function LandingPage() {
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const isFirst = page === 0;
  const isLast = page === pages.length - 1;

  useEffect(() => {
    async function fetchPages() {
      setLoading(true);
      const { data, error } = await supabase
        .from("landing_pages")
        .select("background_url, title, description, testcase_id")
        .order("id", { ascending: true });
      if (!error && data) {
        setPages(data);
      }
      setLoading(false);
    }
    fetchPages();
  }, []);

  if (loading) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading pages...</div>;
  }

  return (
    <div style={{
      backgroundImage: `url(${getDirectImageUrl(pages[page].background_url)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      width: "100vw",
      height: "100vh",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center" }}>
        <h1 style={{ color: '#fff', textShadow: '0 2px 8px #000' }}>{pages[page].title || `Test Case ${page + 1}`}</h1>
        {pages[page].description && (
          <p style={{ color: '#fff', textShadow: '0 1px 4px #000', fontSize: 18 }}>{pages[page].description}</p>
        )}
      </div>
      {/* Left Arrow */}
      {!isFirst && (
        <button
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 32,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
          }}
          onClick={() => setPage(page - 1)}
        >
          &#8592;
        </button>
      )}
      {/* Right Arrow */}
      {!isLast && (
        <button
          style={{
            position: "absolute",
            bottom: 60,
            right: 140,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 32,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
          }}
          onClick={() => setPage(page + 1)}
        >
          &#8594;
        </button>
      )}
      {/* Start Coding Button (always enabled) */}
      <button
        style={{
          position: "absolute",
          bottom: 60,
          right: 60,
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "none",
          background: "#4caf50",
          color: "#fff",
          fontSize: "1.2rem",
          fontWeight: "bold",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          transition: "background 0.2s, opacity 0.2s"
        }}
        onClick={() => navigate("/code", { state: { testcase_id: pages[page].testcase_id } })}
      >
        Start Coding
      </button>
    </div>
  );
} 