import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function MangaReader() {
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(0); // highest unlocked page index
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(() => {
    document.title = "Code Stories";
    async function fetchPagesAndProgress() {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      setUser(userData.user);
      const { data, error } = await supabase
        .from("landing_pages")
        .select("background_url, testcase_id")
        .order("id", { ascending: true });
      if (!error && data) {
        setPages(data);
        if (userData.user) {
          // Fetch progress
          const { data: progressData } = await supabase
            .from("progress")
            .select("page_index")
            .eq("user_id", userData.user.id);
          const maxUnlocked = progressData && progressData.length > 0
            ? Math.max(...progressData.map(p => p.page_index)) + 1
            : 1;
          setUnlocked(maxUnlocked); // user can access up to this index (exclusive)
        } else {
          setUnlocked(1); // not logged in, only first page
        }
      }
      setLoading(false);
    }
    fetchPagesAndProgress();
    // If goToPage is set in location.state, jump to that page
    if (location.state && typeof location.state.goToPage === 'number') {
      setPage(location.state.goToPage);
      window.history.replaceState({}, document.title);
    }
  }, []);

  // Refresh progress if coming back from CodeRunner with success
  useEffect(() => {
    if (location.state && location.state.justUnlocked) {
      // Refetch progress
      async function refetchProgress() {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: progressData } = await supabase
            .from("progress")
            .select("page_index")
            .eq("user_id", userData.user.id);
          const maxUnlocked = progressData && progressData.length > 0
            ? Math.max(...progressData.map(p => p.page_index)) + 1
            : 1;
          setUnlocked(maxUnlocked);
          setJustUnlocked(true);
        }
      }
      refetchProgress();
      // Clean up state so it doesn't trigger again
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Refetch progress every time the page changes
  useEffect(() => {
    async function refetchProgress() {
      const { data: userData } = await supabase.auth.getUser();
      if (userData && userData.user) {
        const { data: progressData } = await supabase
          .from("progress")
          .select("page_index")
          .eq("user_id", userData.user.id);
        const maxUnlocked = progressData && progressData.length > 0
          ? Math.max(...progressData.map(p => p.page_index)) + 1
          : 1;
        setUnlocked(maxUnlocked);
      }
    }
    refetchProgress();
  }, [page]);

  if (loading || pages.length === 0) {
    return <div style={{ maxWidth: 600, margin: "2rem auto" }}>Loading pages...</div>;
  }

  const isFirst = page === 0;
  const isLast = page === pages.length - 1;
  const currentPage = pages[page];
  const isLocked = page >= unlocked;

  // When justUnlocked and user clicks Done, always advance to next page and clear justUnlocked
  const handleDone = () => {
    setPage((prev) => Math.min(prev + 1, pages.length - 1));
    setJustUnlocked(false);
  };

  return (
    <>
      <style>{`
        @media (max-width: 700px) {
          .manga-img {
            min-width: 0 !important;
            min-height: 0 !important;
            max-width: 98vw !important;
            max-height: 60vh !important;
          }
          .manga-btn {
            width: 36px !important;
            height: 36px !important;
            font-size: 18px !important;
            padding: 0 !important;
          }
          .manga-start-btn {
            padding: 8px 16px !important;
            font-size: 15px !important;
            bottom: 12px !important;
            right: 12px !important;
          }
        }
      `}</style>
      <div style={{
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #e0ecff 0%, #b6d0f7 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{
          position: "relative",
          boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
          background: isLocked ? "#eee" : "#fff",
          borderRadius: 8,
          overflow: "hidden",
          opacity: isLocked ? 0.6 : 1
        }}>
          <img
            className="manga-img"
            src={currentPage.background_url}
            alt="Manga Page"
            style={{
              display: "block",
              maxWidth: "100vw",
              maxHeight: "90vh",
              minWidth: 600,
              minHeight: 400,
              width: "auto",
              height: "auto",
              filter: isLocked ? "blur(2px) grayscale(0.7)" : "none"
            }}
          />
          {/* Previous Button */}
          {!isFirst && (
            <button
              className="manga-btn"
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
              className="manga-btn"
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
                cursor: page + 1 < unlocked ? "pointer" : "not-allowed",
                opacity: page + 1 < unlocked ? 1 : 0.5
              }}
              onClick={() => {
                if (page + 1 < unlocked) setPage(page + 1);
              }}
              disabled={page + 1 >= unlocked}
            >
              &#8594;
            </button>
          )}
          {/* Start Coding Button */}
          <button
            className="manga-start-btn"
            style={{
              position: "absolute",
              bottom: 24,
              right: 24,
              background: isLocked ? "#aaa" : "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px 24px",
              fontSize: 18,
              fontWeight: "bold",
              cursor: isLocked ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
            }}
            onClick={() => {
              if (!isLocked) navigate("/code", { state: { testcase_id: currentPage.testcase_id, page_index: page } });
            }}
            disabled={isLocked}
          >
            {isLocked ? "Locked" : "Start Coding"}
          </button>
          {isLocked && (
            <div style={{
              position: "absolute",
              top: 20,
              left: 0,
              width: "100%",
              textAlign: "center",
              color: "#b00",
              fontWeight: "bold",
              fontSize: 22,
              textShadow: "0 2px 8px #fff"
            }}>
              Solve the previous challenge to unlock!
            </div>
          )}
        </div>
      </div>
    </>
  );
} 