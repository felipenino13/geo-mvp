import React from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./map.css";

function distMeters(a, b) {
  const R = 6371000, toRad = d => d * Math.PI/180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function App() {
  const mapRef = React.useRef(null);
  const meMarkerRef = React.useRef(null);
  const [places, setPlaces] = React.useState([]);
  const lastShown = React.useRef({}); // { [placeId]: timestamp }

  // Cargar puntos
  React.useEffect(() => {
    fetch("/places.json").then(r => r.json()).then(setPlaces);
  }, []);

  // Inicializar mapa
  React.useEffect(() => {
    if (mapRef.current) return;
    const map = L.map("map").setView([4.65, -74.06], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    mapRef.current = map;
  }, []);

  // Pintar places (círculos y marcadores)
  React.useEffect(() => {
    if (!mapRef.current || places.length === 0) return;
    places.forEach(p => {
      L.circle([p.lat, p.lng], { radius: p.radius_m, color: "#1976d2" }).addTo(mapRef.current);
      L.marker([p.lat, p.lng]).addTo(mapRef.current).bindPopup(`<b>${p.title}</b><br>${p.body ?? ""}`);
    });
  }, [places]);

  // Tracking de ubicación + disparo de contenido
  React.useEffect(() => {
    if (!mapRef.current) return;
    if (!("geolocation" in navigator)) {
      alert("Tu navegador no soporta Geolocation.");
      return;
    }

    const onPos = (pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      // Actualizar marcador "yo"
      if (!meMarkerRef.current) {
        meMarkerRef.current = L.marker([me.lat, me.lng], { title: "Tú" }).addTo(mapRef.current);
      } else {
        meMarkerRef.current.setLatLng([me.lat, me.lng]);
      }

      // Centrar suave en la primera vez
      if (!onPos._centered) {
        mapRef.current.setView([me.lat, me.lng], 15, { animate: true });
        onPos._centered = true;
      }

      // Chequear geofences
      const now = Date.now();
      for (const p of places) {
        const d = distMeters(me, { lat: p.lat, lng: p.lng });
        const cooldownMs = (p.cooldown_min ?? 15) * 60 * 1000;
        const cooled = !lastShown.current[p.id] || (now - lastShown.current[p.id] > cooldownMs);
        if (d <= p.radius_m && cooled) {
          lastShown.current[p.id] = now;
          // Mostrar contenido (popup en el punto)
          L.popup({ closeOnClick: true })
            .setLatLng([p.lat, p.lng])
            .setContent(`<b>${p.title}</b><br>${p.body ?? ""}`)
            .openOn(mapRef.current);

          // (Opcional) aquí podrías hacer fetch POST para loguear la visita
          // fetch("/api/visit", { method:"POST", body: JSON.stringify({ place_id: p.id, at: new Date().toISOString() }) })
        }
      }
    };

    const id = navigator.geolocation.watchPosition(onPos, console.error, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 10000
    });
    return () => navigator.geolocation.clearWatch(id);
  }, [places]);

  return (
    <>
      <div id="map" />
      <div className="badge">Concede ubicación para activar el contenido por zona.</div>
    </>
  );
}
