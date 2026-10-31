import exifr from 'exifr';

export interface ExifExtractionResult {
  lat?: number;
  lng?: number;
  dateTime?: string; // YYYY-MM-DD HH:mm
  dateStr?: string; // YYYY-MM-DD
  timeStr?: string; // HH:mm
  rawOutput?: string;
}

/** 2자리 숫자 패딩 */
function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/** 사진 파일에서 EXIF GPS 위경도 및 촬영 일시 추출 (exifr 기반 고성능/완전 지원) */
export async function extractExifFromImage(file: File): Promise<ExifExtractionResult> {
  try {
    // exifr는 TIFF, EXIF, GPS, XMP, IPTC, ICC 등 모든 메타데이터 블록을 고속 파싱
    const output = await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      translateValues: true,
      reviveValues: true,
    });

    if (!output) {
      return {};
    }

    let lat: number | undefined;
    let lng: number | undefined;

    if (output.latitude != null && output.longitude != null) {
      lat = Math.round(Number(output.latitude) * 1000000) / 1000000;
      lng = Math.round(Number(output.longitude) * 1000000) / 1000000;
    }

    let dateStr: string | undefined;
    let timeStr: string | undefined;
    let dateTime: string | undefined;

    // exifr는 DateTimeOriginal을 Date 객체 또는 문자열로 자동 반환
    const rawDate = output.DateTimeOriginal || output.CreateDate || output.ModifyDate || output.GPSDateStamp;

    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      const year = rawDate.getFullYear();
      const month = padZero(rawDate.getMonth() + 1);
      const day = padZero(rawDate.getDate());
      const hour = padZero(rawDate.getHours());
      const minute = padZero(rawDate.getMinutes());

      dateStr = `${year}-${month}-${day}`;
      timeStr = `${hour}:${minute}`;
      dateTime = `${dateStr} ${timeStr}`;
    } else if (typeof rawDate === 'string') {
      // "2026:10:19 16:30:00" 형식 대응
      const parts = rawDate.split(' ');
      if (parts.length >= 2) {
        dateStr = parts[0].replace(/:/g, '-');
        const timeParts = parts[1].split(':');
        timeStr = `${timeParts[0]}:${timeParts[1]}`;
        dateTime = `${dateStr} ${timeStr}`;
      } else if (rawDate.includes('-')) {
        dateStr = rawDate.slice(0, 10);
      }
    }

    // GPS 타임스탬프 보조 활용
    if (!timeStr && output.GPSTimeStamp) {
      timeStr = String(output.GPSTimeStamp).slice(0, 5);
    }

    return {
      lat,
      lng,
      dateStr,
      timeStr,
      dateTime,
      rawOutput: JSON.stringify(output),
    };
  } catch (err) {
    console.warn('exifr parse error:', err);
    return {};
  }
}

/**
 * 사진 파일을 HTML5 Canvas를 활용하여 지정된 최대 해상도(기본 1200px)와 압축 품질(기본 0.75)의 Base64 Data URL로 인코딩합니다.
 * 이를 통해 blob: URL 세션 소실 문제를 완벽히 해결하고, DB 및 로컬 스토리지에 안정적으로 영구 보전합니다.
 */
export async function compressImageFile(file: File, maxDim = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      if (!resultStr) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(resultStr);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        resolve(resultStr);
      };
      img.src = resultStr;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
