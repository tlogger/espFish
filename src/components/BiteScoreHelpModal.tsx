import React from 'react';
import { HelpCircle, X, Check, Flame, Thermometer, Wind, Waves, Moon, Sun, Clock } from 'lucide-react';

interface BiteScoreHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BiteScoreHelpModal: React.FC<BiteScoreHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl text-white shadow-2xl p-5 sm:p-6 my-6 max-h-[92vh] overflow-y-auto space-y-4">
        {/* 모달 헤더 */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow">
              Ex
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                입질 종합 지수 (Bite Index) 평가 기준
              </h2>
              <p className="text-[11px] text-slate-400">
                100점 만점 기준 환경 데이터 분석 및 어종별 맞춤 산출 알고리즘
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* 4대 핵심 평가 배점 안내 */}
        <div className="space-y-2.5 text-xs text-slate-200">
          <p className="leading-relaxed text-slate-300">
            <strong>ExFish 입질 종합 지수</strong>는 한국 연안 바다낚시의 성공 확률을 결정짓는 4대 핵심 해양·기상 요소를 실시간 결합하여 <strong>100점 만점</strong>으로 환산한 종합 입질 예측 지수입니다.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* 1. 물때 & 조석 (30점) */}
            <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1">
              <div className="flex items-center justify-between font-bold text-cyan-300">
                <span className="flex items-center gap-1">🌊 물때 & 조류 적합도</span>
                <span className="font-mono text-cyan-400">최대 30점</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                사리(6~9물)의 원활한 조류 흐름 여부와 포인트별 선호 물때, 그리고 대상어종이 좋아하는 조류 속도(강조류 vs 완류) 일치도를 채점합니다.
              </p>
            </div>

            {/* 2. 바람 & 안전 (25점) */}
            <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-300">
                <span className="flex items-center gap-1">💨 풍속 & 맞바람/등바람</span>
                <span className="font-mono text-emerald-400">최대 25점</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                캐스팅과 밑걸림 파악이 쉬운 4.0m/s 이하 등바람은 만점(25점)을 부여하며, 7m/s 이상 맞바람 및 너울 발생 시 감점 및 주의보를 발령합니다.
              </p>
            </div>

            {/* 3. 표층 수온(SST) 적합도 (25점) */}
            <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1">
              <div className="flex items-center justify-between font-bold text-rose-300">
                <span className="flex items-center gap-1">🌡️ 어종별 활성 수온 대역</span>
                <span className="font-mono text-rose-400">최대 25점</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                어종마다 먹이활동을 왕성하게 시작하는 고유 활성 수온이 다릅니다 (우럭 11~17°C, 광어 13~19°C, 무늬오징어 17~23°C 등). 실측 표층수온과의 매칭도를 정밀 계산합니다.
              </p>
            </div>

            {/* 4. 시간대 & 주야간 골든타임 (20점) */}
            <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1">
              <div className="flex items-center justify-between font-bold text-amber-300">
                <span className="flex items-center gap-1">⏰ 골든 피딩 타임</span>
                <span className="font-mono text-amber-400">최대 20점</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                일출(새벽 해창)과 일몰(피딩), 그리고 어종 고유의 주행성/야행성 습성(예: 낙지는 밤, 주꾸미는 낮)에 부합하는 시각에 추가 가산점을 부여합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 종합 점수 구간별 판정 가이드 */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            📊 점수 구간별 출조 가이드
          </span>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between p-1.5 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-200">
              <span className="font-bold">🔥 85점 이상: 특급 출조 찬스</span>
              <span>수온, 물때, 바람, 피딩 삼박자가 완벽한 대박 찬스</span>
            </div>
            <div className="flex items-center justify-between p-1.5 rounded bg-cyan-950/40 border border-cyan-800/60 text-cyan-200">
              <span className="font-bold">✨ 70 ~ 84점: 호조황 기대</span>
              <span>입질 찬스 진입 중, 들물/날물 본류대 집중 공략 추천</span>
            </div>
            <div className="flex items-center justify-between p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              <span className="font-bold">⚖️ 50 ~ 69점: 무난한 여건</span>
              <span>조류가 흐르는 중들물 골든타임을 노려 집중 낚시</span>
            </div>
            <div className="flex items-center justify-between p-1.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-200">
              <span className="font-bold">⚠️ 50점 미만: 주의/비활성</span>
              <span>강풍, 고/저수온 또는 너울 주의, 안전 장구 필수 착용</span>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
