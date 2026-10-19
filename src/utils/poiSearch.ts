export interface PoiSearchResult {
  place_id: number | string;
  display_name: string;
  lat: number;
  lng: number;
  type: string;
}

/**
 * 한국 연안, 항구, 방파제, 관공서 및 전국 지명 POI 고속 검색
 * 1차: Komoot Photon API (전국 OSM 데이터 기반, CORS 무제한, 고속 인덱싱)
 * 2차: OpenStreetMap Nominatim API 폴백
 */
export async function searchPoi(query: string): Promise<PoiSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();

  // 1. Komoot Photon API (CORS 친화적, 강릉시청/삼길포항 등 건물/행정/항구 완벽 검색)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=8`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.features) && data.features.length > 0) {
        // 대한민국(KR) 결과 우선 정렬
        const krFeatures = data.features.filter(
          (f: any) => !f.properties.countrycode || f.properties.countrycode === 'KR'
        );
        const targetList = krFeatures.length > 0 ? krFeatures : data.features;

        return targetList.map((item: any, idx: number) => {
          const props = item.properties || {};
          const coords = item.geometry?.coordinates || [0, 0];
          // Photon GeoJSON 좌표는 [lng, lat] 순서임
          const lng = coords[0];
          const lat = coords[1];

          const name = props.name || cleanQuery;
          const addressParts = [
            props.locality,
            props.district,
            props.city,
            props.state,
          ].filter(Boolean);

          const fullLabel = addressParts.length > 0
            ? `${name} (${addressParts.join(' ')})`
            : name;

          return {
            place_id: props.osm_id || `photon-${idx}`,
            display_name: fullLabel,
            lat,
            lng,
            type: props.osm_value || props.type || '장소',
          };
        });
      }
    }
  } catch (err) {
    console.warn('Photon POI search error, falling back to Nominatim:', err);
  }

  // 2. OpenStreetMap Nominatim 폴백
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&countrycodes=kr&limit=6&addressdetails=1`;
    const res = await fetch(nominatimUrl, {
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          place_id: item.place_id,
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type || '장소',
        }));
      }
    }
  } catch (err) {
    console.warn('Nominatim POI search error:', err);
  }

  return [];
}
