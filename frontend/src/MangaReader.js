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

export default function MangaReader() {
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchPages() {
      setLoading(true);
      const { data, error } = await supabase
        .from("landing_pages")
        .select("background_url, testcase_id")
        .order("id", { ascending: true });
      if (!error && data) {
        setPages(data);
      }
      setLoading(false);
    }
    fetchPages();
  }, []);

  if (loading || pages.length === 0) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading pages...</div>;
  }

  const isFirst = page === 0;
  const isLast = page === pages.length - 1;
  const currentPage = pages[page];

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "#222",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        position: "relative",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
        background: "#fff",
        borderRadius: 8,
        overflow: "hidden"
      }}>
        <img
          src={getDirectImageUrl(currentPage.background_url)}
          alt="Manga Page"
          style={{
            display: "block",
            maxWidth: "90vw",
            maxHeight: "80vh",
            width: "auto",
            height: "auto"
          }}
        />
        {/* Previous Button */}
        {!isFirst && (
          <button
            style={{
              position: "absolute",
              top: "50%",
              left: 16,
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 48,
              height: 48,
              fontSize: 24,
              cursor: "pointer"
            }}
            onClick={() => setPage(page - 1)}
          >
            &#8592;
          </button>
        )}
        {/* Next Button */}
        {!isLast && (
          <button
            style={{
              position: "absolute",
              top: "50%",
              right: 16,
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 48,
              height: 48,
              fontSize: 24,
              cursor: "pointer"
            }}
            onClick={() => setPage(page + 1)}
          >
            &#8594;
          </button>
        )}
        {/* Start Coding Button */}
        <button
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            background: "#4caf50",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "12px 24px",
            fontSize: 18,
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
          }}
          onClick={() => navigate("/code", { state: { testcase_id: currentPage.testcase_id } })}
        >
          Start Coding
        </button>
      </div>
    </div>
  );
} 