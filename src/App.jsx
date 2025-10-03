import React from "react";
// Si NO cargas el CSS por CDN en index.html, descomenta esta línea:
// import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix de íconos (evita el “cuadro en blanco” del marcador en Vite)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

/* -------------------- Helpers -------------------- */
function distMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function withinTimeWindow(p) {
  if (!p.start_at || !p.end_at) return true; // sin ventana => siempre habilitado
  const now = new Date();
  const [sh, sm] = p.start_at.split(":").map(Number);
  const [eh, em] = p.end_at.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm ?? 0, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em ?? 0, 0, 0);
  return now >= start && now <= end;
}

async function logVisit({ place_id, distance_m }) {
  try {
    // Reemplaza por tu endpoint real (Supabase/n8n/webhook)
    // await fetch("https://tu-endpoint.com/visit", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ place_id, at: new Date().toISOString(), distance_m })
    // });
    console.info("VISIT", { place_id, distance_m });
  } catch (e) {
    console.warn("logVisit fail", e);
  }
}

/* -------------------- Tarjeta de contenido -------------------- */
function HitCard({ hit, onClose }) {
  if (!hit) return null;
  const { title, body, media_url, cta_text, cta_url } = hit.place;

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 9999,
        background: "#111",
        color: "#fff",
        padding: 16,
        borderRadius: 12,
        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
        maxWidth: 420,
      }}
    >
      {media_url && (
        <img
          src={media_url}
          alt=""
          style={{ width: "100%", borderRadius: 8, marginBottom: 10 }}
        />
      )}
      <h3 style={{ margin: "0 0 6px 0" }}>{title}</h3>
      <p style={{ margin: "0 0 10px 0", opacity: 0.9, lineHeight: 1.4 }}>
        {body}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {cta_url && (
          <a
            href={cta_url}
            target="_blank"
            rel="noreferrer"
            style={{
              background: "#4f8bfd",
              color: "#000",
              padding: "8px 12px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {cta_text || "Abrir"}
          </a>
        )}
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* -------------------- App principal -------------------- */
export default function App() {
  const mapRef = React.useRef(null);
  const placesLayerRef = React.useRef(null);
  const meMarkerRef = React.useRef(null);

  const [places, setPlaces] = React.useState([]);
  const [hit, setHit] = React.useState(null);

  // Persistencia de últimos shows para cooldown y evitar repetir tras recarga
  const lastShown = React.useRef({});
  React.useEffect(() => {
    try {
      lastShown.current = JSON.parse(
        localStorage.getItem("lastShown") || "{}"
      );
    } catch {}
  }, []);

  // Carga de puntos desde public/places.json
  React.useEffect(() => {
    fetch("/places.json")
      .then((r) => r.json())
      .then((data) => setPlaces(data || []))
      .catch((e) => console.error("places.json error", e));
  }, []);

  // Inicializa mapa
  React.useEffect(() => {
    if (mapRef.current) return;
    const map = L.map("map").setView([4.65, -74.06], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    placesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  // Dibuja places (círculos + marcadores) limpiamente
  React.useEffect(() => {
    if (!mapRef.current) return;
    const layer = placesLayerRef.current;
    layer.clearLayers();
    places.forEach((p) => {
      L.circle([p.lat, p.lng], {
        radius: p.radius_m,
        color: "#1976d2",
        fillOpacity: 0.08,
      }).addTo(layer);
      L.marker([p.lat, p.lng])
        .addTo(layer)
        .bindPopup(`<b>${p.title}</b><br>${p.body ?? ""}`);
    });
  }, [places]);

  // Watch de geolocalización y disparo de contenido
  React.useEffect(() => {
    if (!mapRef.current) return;
    if (!("geolocation" in navigator)) {
      alert("Tu navegador no soporta Geolocation.");
      return;
    }

    const onPos = ({ coords }) => {
      const me = { lat: coords.latitude, lng: coords.longitude };

      // marcador “yo”
      if (!meMarkerRef.current) {
        meMarkerRef.current = L.marker([me.lat, me.lng], { title: "Tú" }).addTo(
          mapRef.current
        );
        mapRef.current.setView([me.lat, me.lng], 15, { animate: true });
      } else {
        meMarkerRef.current.setLatLng([me.lat, me.lng]);
      }

      // Chequeo de proximidad
      const now = Date.now();
      for (const p of places) {
        const d = distMeters(me, { lat: p.lat, lng: p.lng });
        const cooldownMs = (p.cooldown_min ?? 15) * 60 * 1000;
        const cooled =
          !lastShown.current[p.id] ||
          now - lastShown.current[p.id] > cooldownMs;

        if (d <= p.radius_m && cooled && withinTimeWindow(p)) {
          lastShown.current[p.id] = now;
          localStorage.setItem("lastShown", JSON.stringify(lastShown.current));

          // Mostrar tarjeta
          setHit({ place: p, distance: d });

          // (Opcional) también puedes abrir un popup si quieres:
          // L.popup({ closeOnClick: true })
          //  .setLatLng([p.lat, p.lng])
          //  .setContent(`<b>${p.title}</b><br>${p.body ?? ""}`)
          //  .openOn(mapRef.current);

          // Log/analítica
          logVisit({ place_id: p.id, distance_m: Math.round(d) });
          break; // evita disparar varios a la vez
        }
      }
    };

    const id = navigator.geolocation.watchPosition(onPos, console.error, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, [places]);

  return (
    <>
      <div id="map" style={{ height: "100vh", width: "100vw" }} />
      <HitCard hit={hit} onClose={() => setHit(null)} />
      <div
        style={{
          position: "fixed",
          left: 12,
          bottom: 12,
          background: "#111",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 8,
          boxShadow: "0 6px 16px rgba(0,0,0,.2)",
          opacity: 0.9,
        }}
      >
        Concede ubicación para activar el contenido por zona.
      </div>
    </>
  );
}
