export interface PoiSearchResult {
  place_id: number | string;
  display_name: string;
  lat: number;
  lng: number;
  type: string;
  address_name?: string;
  road_address_name?: string;
  place_name?: string;
  category_name?: string;
}

declare global {
  interface Window {
    kakao?: any;
  }
}

/**
 * 카카오 지도 SDK services 라이브러리가 로드될 때까지 대기 (최대 3초)
 */
function waitForKakaoServices(timeoutMs = 3000): Promise<boolean> {
  if (typeof window !== 'undefined' && window.kakao?.maps?.services?.Places) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (window.kakao?.maps?.services?.Places) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * 카카오 지도 SDK 기반 전국 지명, 항구, 방파제, 건물 및 도로명/지번 주소 고속 검색
 * - 1순위: kakao.maps.services.Places (키워드/장소 검색: 항구, 포구, 방파제, 갯바위, 상호, 랜드마크 등)
 * - 2순위: kakao.maps.services.Geocoder (행정구역 및 도로명/지번 주소 검색)
 */
export async function searchPoi(query: string): Promise<PoiSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();

  const isReady = await waitForKakaoServices();
  if (!isReady || !window.kakao?.maps?.services) {
    console.warn('카카오 지도 services 라이브러리를 사용할 수 없습니다.');
    return [];
  }

  const { kakao } = window;
  const services = kakao.maps.services;

  // 1. 카카오 키워드/장소 검색 (Places)
  const placeResults = await new Promise<PoiSearchResult[]>((resolve) => {
    try {
      const ps = new services.Places();
      ps.keywordSearch(
        cleanQuery,
        (data: any[], status: any) => {
          if (status === services.Status.OK && Array.isArray(data)) {
            const mapped: PoiSearchResult[] = data.map((item) => {
              const subLabel = item.road_address_name || item.address_name || '';
              const fullLabel = subLabel ? `${item.place_name} (${subLabel})` : item.place_name;
              const category =
                item.category_group_name ||
                (item.category_name ? item.category_name.split('>').pop()?.trim() : '') ||
                '장소';

              return {
                place_id: item.id || `kakao-place-${item.x}-${item.y}`,
                display_name: fullLabel,
                lat: parseFloat(item.y),
                lng: parseFloat(item.x),
                type: category,
                address_name: item.address_name,
                road_address_name: item.road_address_name,
                place_name: item.place_name,
                category_name: item.category_name,
              };
            });
            resolve(mapped);
          } else {
            resolve([]);
          }
        },
        { size: 10 }
      );
    } catch (err) {
      console.warn('Kakao Places keywordSearch error:', err);
      resolve([]);
    }
  });

  // 키워드 검색 결과가 5개 이상이면 충분하므로 즉시 반환
  if (placeResults.length >= 5) {
    return placeResults;
  }

  // 2. 키워드 검색 결과가 부족하거나 없을 경우 주소 검색(Geocoder) 병행
  const addressResults = await new Promise<PoiSearchResult[]>((resolve) => {
    try {
      if (!services.Geocoder) {
        resolve([]);
        return;
      }
      const geocoder = new services.Geocoder();
      geocoder.addressSearch(cleanQuery, (data: any[], status: any) => {
        if (status === services.Status.OK && Array.isArray(data)) {
          const mapped: PoiSearchResult[] = data.map((item, idx) => {
            const addrName = item.address_name || cleanQuery;
            return {
              place_id: `kakao-addr-${idx}-${item.x}-${item.y}`,
              display_name: `${addrName} (주소)`,
              lat: parseFloat(item.y),
              lng: parseFloat(item.x),
              type: item.address_type === 'ROAD_ADDR' ? '도로명' : '지번주소',
              address_name: item.address_name,
              place_name: addrName,
            };
          });
          resolve(mapped);
        } else {
          resolve([]);
        }
      });
    } catch (err) {
      console.warn('Kakao Geocoder addressSearch error:', err);
      resolve([]);
    }
  });

  // 중복 좌표 제거 및 결합 (Places 우선, Geocoder 보충)
  const combined: PoiSearchResult[] = [...placeResults];
  const existingCoords = new Set(placeResults.map((r) => `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`));

  for (const addr of addressResults) {
    const key = `${addr.lat.toFixed(5)},${addr.lng.toFixed(5)}`;
    if (!existingCoords.has(key)) {
      combined.push(addr);
      existingCoords.add(key);
    }
  }

  return combined;
}
