export interface PoiSearchResult {
  place_id: number;
  display_name: string;
  lat: number;
  lng: number;
  type: string;
}

/**
 * OpenStreetMap Nominatim 기반 한국 연안 및 지명 POI 검색
 */
export async function searchPoi(query: string): Promise<PoiSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const encoded = encodeURIComponent(query.trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&countrycodes=kr&limit=6&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();

    return data.map((item: any) => ({
      place_id: item.place_id,
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || '장소',
    }));
  } catch (err) {
    console.warn('POI search error:', err);
    return [];
  }
}
