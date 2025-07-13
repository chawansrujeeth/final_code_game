import React from "react";

export default function Footer() {
  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .footer-main {
            font-size: 14px !important;
            padding: 0.7rem 0 0.7rem 0 !important;
          }
        }
      `}</style>
      <footer style={{
        background: "linear-gradient(135deg, #232b5d 0%, #3a4ca8 100%)",
        color: "#fff",
        padding: "0.4rem 0", minHeight:40,
        fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'"
      }}>
        <div className="footer-main" style={{ textAlign: "right", fontSize: 12, letterSpacing: 0.5, paddingRight:16 }}>
          Created by Chawan Srujeeth
        </div>
      </footer>
    </>
  );
} 