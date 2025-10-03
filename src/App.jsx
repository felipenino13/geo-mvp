import React from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";

// FIX: iconos de marcador en Vite (si no, sale roto/cuadro vacío)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// Ícono personalizado para “mi ubicación”
const myLocationIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/64/64113.png", // 🔵 un pin azul
  iconSize: [32, 32], // tamaño
  iconAnchor: [16, 32], // el “punto” del pin
  popupAnchor: [0, -32]
});

// Ícono para puntos de interés
const placeIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png", // 📍 rojo
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28]
});

function distMeters(a, b) {
  const R = 6371000, toRad = d => d * Math.PI/180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ----- TTS: Web Speech (SpeechSynthesis) -----
const TTS = (() => {
  let utter = null;
  let state = "idle"; // idle | speaking | paused

  function play(text, { lang = "es-CO", rate = 1, pitch = 1 } = {}) {
    stop(); // corta cualquier lectura anterior
    utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    utter.pitch = pitch;
    speechSynthesis.speak(utter);
    state = "speaking";
    return utter;
  }

  function pause() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      state = "paused";
    }
  }
  function resume() {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      state = "speaking";
    }
  }
  function stop() {
    if (speechSynthesis.speaking || speechSynthesis.paused) {
      speechSynthesis.cancel();
    }
    state = "idle";
    utter = null;
  }
  function getState() { return state; }

  return { play, pause, resume, stop, getState };
})();


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
      L.marker([p.lat, p.lng], { icon: placeIcon })  // ← aquí usas el ícono de lugar
        .addTo(mapRef.current)
        .bindPopup(`<b>${p.title}</b><br>${p.body ?? ""}`);
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
        meMarkerRef.current = L.marker([me.lat, me.lng], { 
        title: "Tú", 
        icon: myLocationIcon 
      }).addTo(mapRef.current);
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
          // Mostrar contenido (popup con botones de voz)
          const uid = `tts-${p.id}`;
          const popupHtml = `
            <div style="max-width:260px">
              <b>${p.title}</b><br/>
              <div style="margin:6px 0 10px 0">${p.body ?? ""}</div>
              <div style="display:flex; gap:8px">
                <button id="${uid}-play" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px;cursor:pointer">▶️ Escuchar</button>
                <button id="${uid}-stop" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px;cursor:pointer">⏹ Detener</button>
              </div>
            </div>
          `;

          L.popup({ closeOnClick: true })
            .setLatLng([p.lat, p.lng])
            .setContent(popupHtml)
            .openOn(mapRef.current);

          // Importante: esperar a que el popup esté en el DOM para enganchar eventos
          requestAnimationFrame(() => {
            const playBtn = document.getElementById(`${uid}-play`);
            const stopBtn = document.getElementById(`${uid}-stop`);

            // Preferencias opcionales desde places.json
            const lang  = p.tts_lang  || "es-CO";
            const rate  = p.tts_rate  ?? 1;   // 0.1 – 10 (recomendado 0.8–1.2)
            const pitch = p.tts_pitch ?? 1;   // 0 – 2

            const updatePlayLabel = () => {
              const s = TTS.getState();
              playBtn.textContent = s === "speaking" ? "⏸ Pausar" : s === "paused" ? "▶️ Reanudar" : "▶️ Escuchar";
            };
            updatePlayLabel();

            playBtn.onclick = () => {
              const state = TTS.getState();
              if (state === "idle") {
                TTS.play(p.body || "", { lang, rate, pitch });
              } else if (state === "speaking") {
                TTS.pause();
              } else if (state === "paused") {
                TTS.resume();
              }
              updatePlayLabel();
            };

            stopBtn.onclick = () => {
              TTS.stop();
              updatePlayLabel();
            };

            // Si el usuario cierra el popup, detenemos la lectura
            mapRef.current.once("popupclose", () => {
              TTS.stop();
            });

            // Si cambia la pestaña, corta (evita hablar en background)
            const onVis = () => { if (document.hidden) TTS.stop(); };
            document.addEventListener("visibilitychange", onVis, { once: true });
          });
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
