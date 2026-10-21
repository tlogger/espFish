import { SpeciesEcology } from './speciesDatabase';

export interface SpeciesRigInfo {
  speciesName: string;
  recommendedRig: {
    lure: string;
    bait: string;
    line: string;
    hookWeight: string;
    action: string;
  };
  feedingStrategy: string;
  goldenHoursText: (sunrise: string, sunset: string, mulNumber: number) => string;
}

export const SPECIES_RIG_DATABASE: Record<string, SpeciesRigInfo> = {
  우럭: {
    speciesName: '우럭',
    recommendedRig: {
      lure: '지그헤드 1/4 ~ 1/2oz + 3~4인치 그럽웜 (모터오일/화이트)',
      bait: '청갯지렁이, 미꾸라지, 꼴뚜기 (생미끼 반응 우수)',
      line: '합사 0.8~1.0호 + 카본 쇼크리더 2.5~3.0호 (암초 쓸림 대비)',
      hookWeight: '조류 세기에 따라 1/4oz(약류) ~ 1/2oz(본류)',
      action: '바닥 착저 후 1~2바퀴 호핑 & 리프트앤폴, 갯바위 턱 직벽 바짝 붙이기',
    },
    feedingStrategy: '어두워진 직후 및 일몰 해창에 여밭 은신처에서 부상하여 왕성한 먹이활동을 합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `일몰 피딩(${sunset} 전후 1.5시간) 및 밤 21시~24시 여밭 중들물 구간`,
  },
  '풀치(갈치)': {
    speciesName: '풀치(갈치)',
    recommendedRig: {
      lure: '역지그헤드(다팅) 5~10g + 야광/축광 스트레이트 웜, 물방울 케미 장착',
      bait: '꽁치 살 포뜬 것, 생미끼 바늘 채비',
      line: '합사 0.6~0.8호 + 쇼크리더 2.5호 + 와이어 목줄 10cm (이빨 쓸림 방지)',
      hookWeight: '표층 부상 시 5~7g, 중층 공략 시 10~14g',
      action: '캐스팅 후 카운트다운(5~10초) → 숏 트위칭 2~3회 후 슬로우 텐션 폴링',
    },
    feedingStrategy: '방파제 가로등이나 집어등 불빛 경계면의 명암 구역에 베이트피시가 모일 때 입질 폭발.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `야간 20:00 ~ 02:00 집어등 집중 시간대 및 해창 직전(${sunrise} 1시간 전)`,
  },
  광어: {
    speciesName: '광어',
    recommendedRig: {
      lure: '다운샷 리그 (싱커 3/4 ~ 1oz + 4인치 섀드웜) or 메탈지그 20~30g',
      bait: '살아있는 미꾸라지, 멸치, 전어 생미끼',
      line: '합사 1.0호 + 카본 쇼크리더 3.0호',
      hookWeight: '바닥을 확실히 읽을 수 있는 3/4oz 이상 봉돌/지그헤드',
      action: '바닥을 절대 띄우지 않고 드래깅(끌기)과 호핑 반복, 스테이(멈춤) 3초 필수',
    },
    feedingStrategy: '모래와 자갈이 섞인 사니질 바닥에 매복하여 상층을 지나가는 루어를 덮칩니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `아침 해창(${sunrise} 전후 1시간) 및 중들물~만조 직전 수온 상승기`,
  },
  감성돔: {
    speciesName: '감성돔',
    recommendedRig: {
      lure: '바닥용 치누 크랭크베이트, 러버지그 7~10g (치닝 낚시)',
      bait: '크릴, 혼무시(참갯지렁이), 게, 옥수수',
      line: '원줄 플로팅 2.0~2.5호 + 목줄 카본 1.5~1.75호 (3~4m)',
      hookWeight: '구멍찌 0.5호~1.5호 반유동 or 전유동 기울찌',
      action: '밑밥 품질 라인에 찌를 태워 흘리며 바닥 30~50cm 위를 유지시키는 견제 동작',
    },
    feedingStrategy: '조류가 수중 여를 타고 넘는 포말 지점과 훈수 지대에서 왕성하게 입질합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `아침 일출(${sunrise}) 전후 2시간 및 만조 후 초날물 조류 흐름 시작 시점`,
  },
  농어: {
    speciesName: '농어',
    recommendedRig: {
      lure: '플로팅 미노우 120~140mm, 싱킹 펜슬 20~28g, 바이브레이션 20g',
      bait: '청갯지렁이 찌낚시 or 산 생새우',
      line: '합사 1.0~1.2호 + 카본 쇼크리더 4.0~5.0호',
      hookWeight: '비거리 60m 이상 확보 가능한 무게중심 이동형 미노우',
      action: '갯바위 부딪히는 하얀 파도 포말(화이트 워터) 안쪽으로 캐스팅 후 슬로우 릴링',
    },
    feedingStrategy: '파도가 갯바위에 부딪혀 포말이 이는 자리와 강한 조류 물골에서 베이트를 사냥합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `새벽 여명(${sunrise} 30분 전) 및 밤 21시~24시 중들물 강류대`,
  },
  참돔: {
    speciesName: '참돔',
    recommendedRig: {
      lure: '타이라바 45~80g (헤드 형광/레드 + 스트레이트 스커트)',
      bait: '크릴, 혼무시, 생새우',
      line: '원줄 합사 0.8~1.0호 + 쇼크리더 3.0~3.5호',
      hookWeight: '조류를 타고 바닥을 찍을 수 있는 고비중 텅스텐 헤드',
      action: '바닥 착저 후 즉시 일정한 속도로 리트리브(감아올리기) 10~15바퀴 후 재착저',
    },
    feedingStrategy: '사리 물때의 거센 본류대 바닥층에서 회유하며 크릴과 패류, 새우류를 섭이합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `사리 물때(6~10물)의 본류대가 힘차게 뻗어나가는 3물~7물 조류 최성기`,
  },
  볼락: {
    speciesName: '볼락',
    recommendedRig: {
      lure: '볼락용 지그헤드 1.0~2.5g + 1.5~2인치 핀테일 웜, 던질찌(플로트 리그)',
      bait: '청갯지렁이(1cm 작게 꿸 것)',
      line: '에스테르 라인 0.3~0.4호 or 합사 0.3호 + 쇼크리더 0.8~1.0호',
      hookWeight: '1.5g 내외 마이크로 지그헤드',
      action: '표층 리트리브 및 텐션 폴링, 집어등 불빛이 끝나는 어둠의 경계면 공략',
    },
    feedingStrategy: '야간에 해초대와 수중 여 위로 떠올라 플랑크톤과 치어를 공격합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `해질녘(${sunset}) 직후부터 밤 23시까지의 잔잔한 만조 전후 물돌이 타임`,
  },
  주꾸미: {
    speciesName: '주꾸미',
    recommendedRig: {
      lure: '주꾸미용 소형 에기(왕눈이 에기) + 봉돌 8~12호 직결 채비',
      bait: '에기에 마른 오징어나 쥐포 살짝 감기(선택)',
      line: '합사 0.8~1.0호 (원줄 직결)',
      hookWeight: '바닥 모래밭 감각이 팽팽히 느껴지는 10호 내외 싱커',
      action: '바닥을 콩콩 찍어주며 3~5초 스테이(무게감 감지 후 강한 챔질)',
    },
    feedingStrategy: '약한 조류(조금~3물, 12~14물)의 잔잔한 모래뻘 바닥에서 활발히 움직입니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `주간 08:00 ~ 15:00 조류가 완만하게 흐르는 조금 물때 낮 시간대`,
  },
  갑오징어: {
    speciesName: '갑오징어',
    recommendedRig: {
      lure: '수평 에기 (2.2~2.5호) + 다운샷 가짓줄 채비 (가짓줄 10~20cm)',
      bait: '학꽁치 포(삼봉 에기 장착)',
      line: '합사 0.8~1.0호 + 카본 2.5호 쇼크리더',
      hookWeight: '물골 수심에 맞춰 8~14호 봉돌',
      action: '에기가 바닥에서 10cm 떠서 수평을 유지하도록 천천히 바닥 긁기 후 5초 정지',
    },
    feedingStrategy: '여밭과 모래가 만나는 경계 수로에서 새우류를 덮칩니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `간조 후 초들물~중들물로 바뀌며 맑은 물이 들어오는 오전 09시~12시`,
  },
  무늬오징어: {
    speciesName: '무늬오징어',
    recommendedRig: {
      lure: '에기 3.0~3.5호 (샤크 베이직/셸로우, 케이무라/네온 색상)',
      bait: '에깅 전용 인조 에기',
      line: '합사 0.6~0.8호 + 카본 쇼크리더 2.0~2.5호',
      hookWeight: '수심 5m 기준 에기 3.5호 (침강속도 3초/m)',
      action: '바닥 안착 → 2단 저킹(샤크리) 3~4회 → 슬로우 텐션 폴링 (입질은 폴링 시 발생)',
    },
    feedingStrategy: '잘피밭(해초)과 수중 여가 잘 발달된 곶부리 조류 소통 구역을 회유합니다.',
    goldenHoursText: (sunrise, sunset, mul) =>
      `새벽 해창(${sunrise}) 및 일몰(${sunset}) 전후 피딩 2시간 골든타임`,
  },
};

/**
 * 어종명으로 추천 채비 및 전략 정보 조회 (부분 일치 매칭 지원)
 */
export function getSpeciesRigInfo(speciesName: string): SpeciesRigInfo {
  if (SPECIES_RIG_DATABASE[speciesName]) {
    return SPECIES_RIG_DATABASE[speciesName];
  }
  const found = Object.values(SPECIES_RIG_DATABASE).find(
    (info) => info.speciesName.includes(speciesName) || speciesName.includes(info.speciesName)
  );
  if (found) return found;

  // 기본 Fallback (우럭/범용 바다 루어)
  return {
    speciesName,
    recommendedRig: {
      lure: '범용 지그헤드 3/8oz + 3인치 그럽웜 또는 20g 스푼/메탈',
      bait: '청갯지렁이, 생새우 (가장 무난한 생미끼)',
      line: '합사 1.0호 + 카본 쇼크리더 2.5호',
      hookWeight: '조류 세기에 맞춘 1/4 ~ 1/2oz 봉돌',
      action: '바닥 착저 후 천천히 감아들이며 숏 호핑 액션 부여',
    },
    feedingStrategy: '조류가 흐르기 시작하는 물돌이 타임 및 일출/일몰 시간대에 입질 확률이 가장 높습니다.',
    goldenHoursText: (sunrise, sunset) =>
      `일출(${sunrise}) 및 일몰(${sunset}) 전후 1.5시간 피딩 타임`,
  };
}
