/**
 * Vercel serverless — trip-backend에 배포
 *
 * 환경 변수:
 *   TMAP_APP_KEY — https://openapi.sk.com (TMAP 앱 키)
 *
 * POST /api/travel
 * Body: { originLng, originLat, destLng, destLat }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TMAP_HEADERS = (appKey) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  appKey,
});

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) {
    return res.status(500).json({ error: "TMAP_APP_KEY가 설정되지 않았습니다." });
  }

  const { originLng, originLat, destLng, destLat } = req.body || {};
  if ([originLng, originLat, destLng, destLat].some((v) => v == null || !isFinite(Number(v)))) {
    return res.status(400).json({ error: "좌표가 올바르지 않습니다." });
  }

  const origin = { lng: Number(originLng), lat: Number(originLat) };
  const dest = { lng: Number(destLng), lat: Number(destLat) };

  try {
    const [originLabel, car, transit] = await Promise.all([
      fetchTmapOriginLabel(origin, appKey),
      fetchTmapCar(origin, dest, appKey),
      fetchTmapTransit(origin, dest, appKey),
    ]);

    const hints = [car];
    if (transit.train) hints.push(transit.train);
    else if (transit.bus) hints.push(transit.bus);

    return res.status(200).json({ originLabel, hints, source: "tmap" });
  } catch (err) {
    console.error("travel api error:", err);
    return res.status(500).json({
      error: err.message || "교통 정보를 가져오지 못했습니다.",
    });
  }
}

async function fetchTmapOriginLabel(origin, appKey) {
  const url = new URL("https://apis.openapi.sk.com/tmap/geo/reversegeocoding");
  url.searchParams.set("version", "1");
  url.searchParams.set("lat", String(origin.lat));
  url.searchParams.set("lon", String(origin.lng));
  url.searchParams.set("coordType", "WGS84GEO");
  url.searchParams.set("addressType", "A00");
  url.searchParams.set("appKey", appKey);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("출발지 조회 실패");
  const data = await res.json();
  const info = data.addressInfo;
  if (!info) return "현재 위치";

  if (info.fullAddress) return info.fullAddress;
  return [info.city_do, info.gu_gun, info.legalDong || info.adminDong]
    .filter(Boolean)
    .join(" ");
}

async function fetchTmapCar(origin, dest, appKey) {
  const res = await fetch(
    "https://apis.openapi.sk.com/tmap/tmap/routes?version=1",
    {
      method: "POST",
      headers: TMAP_HEADERS(appKey),
      body: JSON.stringify({
        startX: origin.lng,
        startY: origin.lat,
        endX: dest.lng,
        endY: dest.lat,
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        searchOption: "0",
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMAP 자차 경로 오류: ${res.status} ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  const start = (data.features || []).find(
    (f) => f.properties?.pointType === "S",
  );
  const props = start?.properties;
  if (!props?.totalTime) throw new Error("자차 경로를 찾지 못했습니다.");

  return {
    icon: "🚗",
    label: "자차",
    time: formatDuration(props.totalTime),
    distance: formatDistance(props.totalDistance || 0),
    note: "TMAP",
  };
}

async function fetchTmapTransit(origin, dest, appKey) {
  const res = await fetch("https://apis.openapi.sk.com/transit/routes", {
    method: "POST",
    headers: TMAP_HEADERS(appKey),
    body: JSON.stringify({
      startX: String(origin.lng),
      startY: String(origin.lat),
      endX: String(dest.lng),
      endY: String(dest.lat),
      count: 8,
      lang: 0,
      format: "json",
    }),
  });

  if (!res.ok) {
    console.warn("TMAP transit error:", res.status, await res.text());
    return { bus: null, train: null };
  }

  const data = await res.json();
  const itineraries = data.metaData?.plan?.itineraries || [];

  return {
    train: pickBestTrainItinerary(itineraries),
    bus: pickBestBusItinerary(itineraries),
  };
}

function pickBestTrainItinerary(itineraries) {
  let best = null;

  for (const it of itineraries) {
    const trainLegs = (it.legs || []).filter((leg) => leg.mode === "TRAIN");
    if (!trainLegs.length) continue;

    const first = trainLegs[0];
    const last = trainLegs[trainLegs.length - 1];
    const distance = sumLegDistance(it.legs);
    const candidate = {
      icon: "🚆",
      label: "기차",
      time: formatDuration(it.totalTime || 0),
      distance: formatDistance(distance),
      note: `${cleanStationName(first.start?.name)} → ${cleanStationName(last.end?.name)} · TMAP`,
      seconds: it.totalTime || 0,
    };
    if (!best || candidate.seconds < best.seconds) best = candidate;
  }

  if (!best) return null;
  delete best.seconds;
  return best;
}

function pickBestBusItinerary(itineraries) {
  let best = null;

  for (const it of itineraries) {
    const hasTrain = (it.legs || []).some((leg) => leg.mode === "TRAIN");
    if (hasTrain) continue;

    const busLegs = (it.legs || []).filter((leg) =>
      ["BUS", "EXPRESSBUS", "SUBWAY"].includes(leg.mode),
    );
    if (!busLegs.length) continue;

    const first = busLegs[0];
    const last = busLegs[busLegs.length - 1];
    const label = busLegs.some((leg) => leg.mode === "EXPRESSBUS")
      ? "버스"
      : busLegs.some((leg) => leg.mode === "SUBWAY")
        ? "대중교통"
        : "버스";

    const distance = sumLegDistance(it.legs);
    const candidate = {
      icon: label === "대중교통" ? "🚇" : "🚌",
      label,
      time: formatDuration(it.totalTime || 0),
      distance: formatDistance(distance),
      note: `${cleanStationName(first.start?.name)} → ${cleanStationName(last.end?.name)} · TMAP`,
      seconds: it.totalTime || 0,
    };
    if (!best || candidate.seconds < best.seconds) best = candidate;
  }

  if (!best) return null;
  delete best.seconds;
  return best;
}

function sumLegDistance(legs) {
  return (legs || []).reduce((sum, leg) => sum + (leg.distance || 0), 0);
}

function cleanStationName(name) {
  return String(name || "")
    .replace(/\(.*?\)/g, "")
    .trim();
}

function formatDuration(seconds) {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `약 ${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `약 ${h}시간 ${m}분` : `약 ${h}시간`;
}

function formatDistance(meters) {
  const km = meters / 1000;
  if (km < 1) return `약 ${Math.round(meters)}m`;
  return `약 ${km < 10 ? km.toFixed(1) : Math.round(km)}km`;
}
