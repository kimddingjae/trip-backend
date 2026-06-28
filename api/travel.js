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

function tmapUrl(path, appKey, params = {}) {
  const url = new URL(`https://apis.openapi.sk.com${path}`);
  url.searchParams.set("version", "1");
  url.searchParams.set("appKey", appKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizeAppKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function tmapErrorMessage(status, text) {
  if (status === 401 || status === 403) {
    if (text.includes("MISSING_AUTHENTICATION_TOKEN") || text.includes("Unauthorized")) {
      return "TMAP appKey 인증 실패입니다. Vercel의 TMAP_APP_KEY와 SK open API 상품 신청(자동차 경로안내)을 확인해 주세요.";
    }
    return "TMAP API 권한이 없습니다. 해당 상품 사용 신청 여부를 확인해 주세요.";
  }
  return `TMAP 오류 (${status})`;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const appKey = normalizeAppKey(process.env.TMAP_APP_KEY);
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
    const [originResult, carResult, transitResult] = await Promise.allSettled([
      fetchTmapOriginLabel(origin, appKey),
      fetchTmapCar(origin, dest, appKey),
      fetchTmapTransit(origin, dest, appKey),
    ]);

    const originLabel =
      originResult.status === "fulfilled" ? originResult.value : "현재 위치";
    const car = carResult.status === "fulfilled" ? carResult.value : null;
    const transit =
      transitResult.status === "fulfilled"
        ? transitResult.value
        : { bus: null, train: null, error: "failed" };

    const hints = [];
    if (car) hints.push(car);
    if (transit.train) hints.push(transit.train);
    if (transit.bus) hints.push(transit.bus);

    let transitNote = null;
    if (!transit.train && !transit.bus) {
      if (transit.error === "forbidden") {
        transitNote =
          "버스·기차는 PRODUCTS → API TMAP 대중교통 상품 신청 후 표시됩니다.";
      } else if (car) {
        transitNote = "이 구간의 대중교통 경로를 찾지 못했습니다.";
      }
    }

    if (!hints.length) {
      const err =
        carResult.status === "rejected"
          ? carResult.reason?.message
          : transitResult.status === "rejected"
            ? transitResult.reason?.message
            : "경로를 찾지 못했습니다.";
      return res.status(500).json({ error: err || "교통 정보를 가져오지 못했습니다." });
    }

    return res.status(200).json({ originLabel, hints, source: "tmap", transitNote });
  } catch (err) {
    console.error("travel api error:", err);
    return res.status(500).json({
      error: err.message || "교통 정보를 가져오지 못했습니다.",
    });
  }
}

async function fetchTmapOriginLabel(origin, appKey) {
  const url = tmapUrl("/tmap/geo/reversegeocoding", appKey, {
    lat: origin.lat,
    lon: origin.lng,
    coordType: "WGS84GEO",
    addressType: "A00",
  });

  const res = await fetch(url, { headers: { Accept: "application/json", appKey } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(tmapErrorMessage(res.status, text));
  }
  const data = await res.json();
  return formatOriginLabel(data.addressInfo);
}

function formatOriginLabel(info) {
  if (!info) return "현재 위치";

  const parts = [info.city_do, info.gu_gun].filter(Boolean);
  if (parts.length) return parts.join(" ");

  return "현재 위치";
}

async function fetchTmapCar(origin, dest, appKey) {
  const routeBody = {
    startX: origin.lng,
    startY: origin.lat,
    endX: dest.lng,
    endY: dest.lat,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    searchOption: "0",
    trafficInfo: "N",
    format: "json",
  };

  const attempts = [
    () =>
      fetch(
        `https://apis.openapi.sk.com/tmap/tmap/routes?version=1&appKey=${encodeURIComponent(appKey)}`,
        {
          method: "POST",
          headers: TMAP_HEADERS(appKey),
          body: JSON.stringify(routeBody),
        },
      ),
    () =>
      fetch(
        `https://apis.openapi.sk.com/tmap/routes?version=1&format=json&appKey=${encodeURIComponent(appKey)}`,
        {
          method: "POST",
          headers: TMAP_HEADERS(appKey),
          body: JSON.stringify(routeBody),
        },
      ),
    () => {
      const params = new URLSearchParams({
        version: "1",
        appKey,
        startX: String(origin.lng),
        startY: String(origin.lat),
        endX: String(dest.lng),
        endY: String(dest.lat),
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        searchOption: "0",
        trafficInfo: "N",
        format: "json",
      });
      return fetch("https://apis.openapi.sk.com/tmap/tmap/routes", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          appKey,
        },
        body: params.toString(),
      });
    },
  ];

  let lastError = "자차 경로를 찾지 못했습니다.";

  for (const attempt of attempts) {
    const res = await attempt();
    if (!res.ok) {
      const text = await res.text();
      lastError = tmapErrorMessage(res.status, text);
      continue;
    }

    const data = await res.json();
    const start = (data.features || []).find(
      (f) => f.properties?.pointType === "S" || f.properties?.pointType === "SP",
    );
    const props = start?.properties;
    if (!props?.totalTime) {
      lastError = "자차 경로를 찾지 못했습니다.";
      continue;
    }

    return {
      icon: "🚗",
      label: "자차",
      time: formatDuration(props.totalTime),
      distance: formatDistance(props.totalDistance || 0),
      note: "TMAP",
    };
  }

  throw new Error(lastError);
}

async function fetchTmapTransit(origin, dest, appKey) {
  const res = await fetch(
    `https://apis.openapi.sk.com/transit/routes?appKey=${encodeURIComponent(appKey)}`,
    {
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
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.warn("TMAP transit error:", res.status, text);
    return {
      bus: null,
      train: null,
      error: res.status === 401 || res.status === 403 ? "forbidden" : "failed",
    };
  }

  const data = await res.json();
  const itineraries = data.metaData?.plan?.itineraries || [];

  return {
    train: pickBestTrainItinerary(itineraries),
    bus: pickBestBusItinerary(itineraries),
    error: itineraries.length ? null : "empty",
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
