import React from "react";

export default function Footer() {
  return (
    <footer style={{
      background: "linear-gradient(135deg, #232b5d 0%, #3a4ca8 100%)",
      color: "#fff",
      padding: "2.5rem 0 0.5rem 0",
      marginTop: 48,
      fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, 'sans-serif'"
    }}>
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "0 2rem"
      }}>
        {/* Site Description */}
        <div style={{ flex: 1, minWidth: 220, marginBottom: 24 }}>
          <h2 style={{ color: "#a5b4fc", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Anime Stories</h2>
          <div style={{ color: "#e0e7ff", fontSize: 15 }}>
            Immerse yourself in captivating visual novels with stunning anime artwork and engaging storytelling.
          </div>
        </div>
        {/* Quick Links */}
        <div style={{ flex: 1, minWidth: 180, marginBottom: 24 }}>
          <h3 style={{ color: "#60a5fa", fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Quick Links</h3>
          <div><a href="#contact" style={{ color: "#bae6fd", textDecoration: "none", display: "block", marginBottom: 6 }}>Contact Us</a></div>
          <div><a href="#privacy" style={{ color: "#bae6fd", textDecoration: "none", display: "block" }}>Privacy Policy</a></div>
        </div>
        {/* Social Icons */}
        <div style={{ flex: 1, minWidth: 180, marginBottom: 24, textAlign: "right" }}>
          <h3 style={{ color: "#60a5fa", fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Follow Us</h3>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <span style={{ background: "#38bdf8", color: "#fff", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>T</span>
            <span style={{ background: "#f472b6", color: "#fff", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>I</span>
            <span style={{ background: "#60a5fa", color: "#fff", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>F</span>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 2rem 0.5rem 2rem" }}>
        <hr style={{ border: "none", borderTop: "1px solid #475569", margin: "1.5rem 0" }} />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* Contact Us */}
          <div id="contact" style={{ flex: 1, minWidth: 260, marginBottom: 16 }}>
            <h4 style={{ color: "#38bdf8", fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Contact Us</h4>
            <div style={{ color: "#e0e7ff", fontSize: 15 }}>
              Email: hello@animestories.com<br />
              Phone: (555) 123-4567<br />
              Address: 123 Anime Street, Tokyo, Japan
            </div>
          </div>
          {/* Privacy Policy */}
          <div id="privacy" style={{ flex: 2, minWidth: 320, marginBottom: 16 }}>
            <h4 style={{ color: "#38bdf8", fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Privacy Policy</h4>
            <div style={{ color: "#e0e7ff", fontSize: 15 }}>
              We respect your privacy and are committed to protecting your personal data. This privacy notice will inform you how we look after your personal data when you visit our website and tell you about your privacy rights.
            </div>
          </div>
        </div>
        <div style={{ color: "#a5b4fc", fontSize: 14, textAlign: "center", marginTop: 16 }}>
          © 2024 Anime Stories. All rights reserved.
        </div>
      </div>
    </footer>
  );
} 