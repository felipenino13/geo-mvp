import React from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./map.css";

// Fix íconos por defecto Leaflet (Vite)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// Ícono “mi ubicación”
const myLocationIcon = L.icon({
  iconUrl: "/icons/my-location.png", // pon el archivo en /public/icons/
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Ícono lugares
const placeIcon = L.icon({
  iconUrl: "/icons/place.png", // pon el archivo en /public/icons/
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Radio global de cercanía para renderizar lugares (metros)
const NEARBY_RADIUS_M = 5000; // 5 km

// Distancia Haversine (m)
function distMeters(a, b) {
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function App() {
  const mapRef = React.useRef(null);
  const placesLayerRef = React.useRef(null);
  const meMarkerRef = React.useRef(null);

  const [places, setPlaces] = React.useState([]);
  const [myPos, setMyPos] = React.useState(null);
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
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    placesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  // Dibuja (o redibuja) SOLO los lugares cercanos (≤ 5 km) según mi posición
  const redrawNearbyPlaces = React.useCallback(() => {
    if (!mapRef.current || !placesLayerRef.current) return;
    const layer = placesLayerRef.current;
    layer.clearLayers();

    if (!myPos) return; // hasta no tener ubicación, no mostramos lugares

    const nearby = places.filter(p =>
      distMeters(myPos, { lat: p.lat, lng: p.lng }) <= NEARBY_RADIUS_M
    );

    nearby.forEach(p => {
      L.circle([p.lat, p.lng], { radius: p.radius_m, color: "#1976d2", fillOpacity: 0.08 })
        .addTo(layer);
      L.marker([p.lat, p.lng], { icon: placeIcon })
        .addTo(layer)
        .bindPopup(`
          <div style="max-width:240px">
            <b>${p.title}</b><br/>
            ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%;border-radius:6px;margin:6px 0"/>` : ""}
            <div>${p.body ?? ""}</div>
          </div>
        `);
    });
  }, [places, myPos]);

  // Redibuja cuando cambie mi posición o el set de lugares
  React.useEffect(() => { redrawNearbyPlaces(); }, [redrawNearbyPlaces]);

  // Tracking de ubicación + geofences (sobre los cercanos)
  React.useEffect(() => {
    if (!mapRef.current) return;
    if (!("geolocation" in navigator)) {
      alert("Tu navegador no soporta Geolocation.");
      return;
    }

    const onPos = (pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyPos(me);

      // Marcador “yo”
      if (!meMarkerRef.current) {
        meMarkerRef.current = L.marker([me.lat, me.lng], { title: "Tú", icon: myLocationIcon })
          .addTo(mapRef.current);
        mapRef.current.setView([me.lat, me.lng], 15, { animate: true });
      } else {
        meMarkerRef.current.setLatLng([me.lat, me.lng]);
      }

      // Geofences solo sobre los cercanos
      const now = Date.now();
      const nearby = places.filter(p =>
        distMeters(me, { lat: p.lat, lng: p.lng }) <= NEARBY_RADIUS_M
      );

      for (const p of nearby) {
        const d = distMeters(me, { lat: p.lat, lng: p.lng });
        const cooldownMs = (p.cooldown_min ?? 15) * 60 * 1000;
        const cooled = !lastShown.current[p.id] || (now - lastShown.current[p.id] > cooldownMs);
        if (d <= p.radius_m && cooled) {
          lastShown.current[p.id] = now;
          L.popup({ closeOnClick: true })
            .setLatLng([p.lat, p.lng])
            .setContent(`
              <div style="max-width:240px">
                <b>${p.title}</b><br/>
                ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%;border-radius:6px;margin:6px 0"/>` : ""}
                <div>${p.body ?? ""}</div>
              </div>
            `)
            .openOn(mapRef.current);
          break; // evita múltiples popups a la vez
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
      <div className="badge">
        {myPos
          ? "Mostrando lugares a ≤ 5 km de tu ubicación."
          : "Concede ubicación para activar el contenido por zona."}
      </div>
    </>
  );
}
