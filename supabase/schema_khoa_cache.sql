-- ==============================================================================
-- ExFish KHOA(국립해양조사원) 공공데이터 전 종목 중앙 DB 캐시 테이블
-- 대상 API: 조위(surveyTideLevel), 수심(waterDepth), 풍향풍속(surveyWind), 수온(surveyWaterTemp), ROMS 조류(roms)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.khoa_global_cache (
    cache_key VARCHAR(120) PRIMARY KEY,               -- 캐시 키 (예: 'TIDE:DT_0001:20261027', 'DEPTH:37.451_126.592')
    api_type VARCHAR(20) NOT NULL,                   -- 'TIDE' | 'DEPTH' | 'WIND' | 'WATER_TEMP' | 'ROMS'
    sub_key VARCHAR(60),                             -- 관측소코드(obs_code) 또는 격자좌표 키
    payload JSONB NOT NULL,                          -- 정제된 응답 데이터 본체
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,    -- 만료 일시 (UTC)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 검색 성능 최적화를 위한 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_khoa_cache_lookup 
ON public.khoa_global_cache (cache_key, expires_at);

-- API 타입별 인덱스
CREATE INDEX IF NOT EXISTS idx_khoa_cache_type 
ON public.khoa_global_cache (api_type, expires_at);

-- RLS (Row Level Security) 설정: 모든 사용자가 읽고 쓸 수 있도록 허용 (익명 클라이언트 캐싱)
ALTER TABLE public.khoa_global_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on khoa_global_cache" 
ON public.khoa_global_cache 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert/update access on khoa_global_cache" 
ON public.khoa_global_cache 
FOR ALL 
USING (true) 
WITH CHECK (true);
