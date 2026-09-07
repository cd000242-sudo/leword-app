/**
 * 씨앗 창고 읽기 — build-seed-db 가 긁어 둔 data/seed-db.json 에서 이 회차에 쓸 씨앗을 고른다.
 *
 * 왜 창고가 필요한가(사장님 2026-09-07 "씨앗은 방대할수록 좋지 않니?"): 손으로 적은
 * 씨앗은 상시 어휘 80여 개 + 계절 표 200개가 전부였다. 검색광고가 공식으로 내주는
 * month·event·biztpId 를 긁으니 **85,534개**가 나왔다(실측, 3,000↑ 17,760).
 *
 * 다만 씨앗을 전부 태울 수는 없다. 씨앗 하나가 연관어 1회 + 자동완성 수십 회를
 * 부르므로 회차 시간이 씨앗 수에 비례한다. 그래서 여기서 **고른다**:
 *   ① 이미 쓰는 씨앗과 겹치는 것 제외 — 같은 자리를 두 번 파지 않는다
 *   ② 검색량 하한 위 — 트래픽이 목적이므로 작은 말로 시작하지 않는다
 *   ③ 회차마다 **다른 구간**을 판다 — 85,534개를 매번 앞에서부터 자르면 뒤쪽은
 *      영영 안 파인다. 회차 번호로 창을 밀어 전체를 훑는다(결정론적, 난수 아님).
 *
 * 창고가 없으면 빈 배열이다 — 발굴은 기존 씨앗으로 그대로 돈다(회차를 죽이지 않는다).
 */
import fs from 'fs';
import path from 'path';

export interface SeedDbEntry {
  keyword: string;
  /** 검색광고 실측 월간 검색량(PC+모바일). 창고를 만들 때 함께 받아 둔 값이다. */
  searchVolume: number;
  /** 어느 창구에서 왔나 — `biztp:17` · `month:11` · `event:23`. 옛 창고엔 없다. */
  source?: string;
}

/**
 * 업종 ID ↔ 블로그 주제.
 *
 * 왜 필요한가(실측 2026-09-07): 창고를 주제 구분 없이 뿌렸더니 '자동차' 주제에
 * 페키니즈분양·입주청소가, '건강·의학'에 초등학교운동회가 갔다. 그대로 두면
 * 보드에 그 주제로 실린다 — 사장님이 자동차 탭에서 강아지 분양을 보게 된다.
 *
 * 업종은 이름표가 명확해서 매핑할 수 있다. 각 줄의 근거는 그 업종의 검색량 상위
 * 키워드를 직접 뽑아 본 것이다(같은 날 실측):
 *   2  미용실·피부과·정형외과·이비인후과·내과·치과      → 건강·의학
 *   17 GV90·셀토스·BMW·중고차·쏘렌토·GV80             → 자동차
 *   37 아이돌봄서비스·첫만남이용권·산후조리원            → 육아·결혼
 *   44 KB손해보험·대출계산기·금리·주택담보대출          → 비즈니스·경제
 *   49 강릉가볼만한곳·군산·포항·단양·대구              → 국내여행
 *   27 손없는날·택배·택시·포장이사·콜택시·퀵           → 일상·생각
 *
 * 여기 없는 업종은 쓰지 않는다 — 억지로 끼워 맞추면 그 분류가 틀렸을 때 조용히
 * 밭이 비뚤어진다. '사회·정치'는 대응하는 업종이 없어 비워 둔다(계절 표의
 * 연말정산·주민세·지원금이 이미 그 자리를 판다).
 */
export const BIZTP_TOPIC: Record<string, string> = {
  '2': '건강·의학',       // 미용실·피부과·정형외과 … 151위 임플란트·발톱무좀
  '3': '육아·결혼',       // 아기침대·기저귀가방 … 151위 신생아젖병·젖병소독기
  '5': '비즈니스·경제',   // 삼성전자주가·환율 … 151위 중고차대출·주택담보대출
  '9': '비즈니스·경제',   // 부동산·아파트·청약 … 151위 전주아파트·공공분양
  '17': '자동차',         // GV90·셀토스·중고차 … 601위까지 렌트카·폐차장(깨끗)
  '27': '일상·생각',      // 손없는날·택배·포장이사 … 151위 트럭대여·5톤이사비용
  '29': '건강·의학',      // 오메가3·유산균 … 151위 알부민영양제·꿀스틱
  '30': '건강·의학',      // 피부과·정형외과 … 151위 리쥬란·요실금치료
  '31': '건강·의학',      // 무릎보호대·안경 … 151위 보청기·마사지기계
  '32': '건강·의학',      // 약국·미녹시딜 … 151위 간장약·아로나민
  '35': '육아·결혼',      // 웨딩박람회·웨딩드레스 … 151위 웨딩홀·스튜디오
  '36': '육아·결혼',      // 키즈카페·유모차 … 151위 이유식찜기·출산용품
  '37': '육아·결혼',      // 산후조리원·첫만남이용권 … 601위까지 산후도우미(깨끗)
  '43': '비즈니스·경제',  // 주가지수·증시 … 151위 자동차보험·ISA
  '44': '비즈니스·경제',  // 신용점수조회·대출이자 … 151위 담보대출한도·오토론
  '45': '비즈니스·경제',  // 코스피·환율 … 151위 녹십자주가·가상화폐
  '57': '국내여행',       // 경주·부산·강릉 … 151위 서울근교가볼만한곳
  '58': '비즈니스·경제',  // 강남부동산·아파트 … 151위 대전주택매매
  '59': '비즈니스·경제',  // 고시원·공유오피스 … 151위 단기임대·원룸텔
  '60': '비즈니스·경제',  // 아파트·오피스텔 … 151위 부산아파트시세
  '61': '비즈니스·경제',  // 부동산경매·중개수수료 … 151위 대법원경매·시골집매매
  '73': '국내여행',       // 펜션·단체숙소 … 151위 강릉감성숙소·계곡펜션
  /*
   * 뺀 업종(2026-09-07 오염 실측). 상위 몇 개만 보고 매핑했다가 51위부터 딴 밭이었다:
   *   1  오늘의운세로 시작하는데 51위가 강아지사료·침대매트리스 — 반려동물·인테리어 혼재
   *   15 금시세로 시작하는데 51위가 양말·골프웨어·티셔츠 — 실은 패션 계열
   *   34 연인·결혼으로 시작하는데 51위가 외로움·귀족·묵주팔찌 — 연애·종교 잡탕
   *   49 지역 가볼만한곳인데 51위가 리틀야구·도예체험·프리다이빙 — 체험·취미
   *   75 제주날씨로 시작하는데 51위가 몽골항공권·다낭숙소 — 해외여행(다른 주제)
   * 억지로 끼워 맞추면 그 주제 보드가 조용히 비뚤어진다.
   */
};

/**
 * 업종당 씨앗 상한 — 검색량 상위 이만큼만 그 업종 것으로 인정한다.
 *
 * 업종 응답은 1,200개씩 오는데 뒤로 갈수록 그 업종 색이 옅어진다(실측:
 * biztp:17·37 은 600위까지 깨끗했지만 biztp:15 는 51위부터 딴 밭이었다).
 * 300 이면 깨끗한 업종은 그대로 살고, 흐려지는 업종은 앞부분만 쓴다.
 */
export const BIZTP_TOP_N = 300;

/** 이 씨앗이 어느 주제 것인가. 업종이 아니거나 매핑이 없으면 null(주제 무관). */
export function topicOfSeed(entry: SeedDbEntry): string | null {
  const source = String(entry.source || '');
  if (!source.startsWith('biztp:')) return null;
  return BIZTP_TOPIC[source.slice(6)] || null;
}

export interface SeedDb {
  builtAt: string;
  totalSeeds: number;
  seeds: SeedDbEntry[];
}

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'data', 'seed-db.json');

/** 창고를 읽는다. 없거나 깨졌으면 null — 부르는 쪽이 기존 씨앗으로 계속 간다. */
export function loadSeedDb(filePath: string = DEFAULT_PATH): SeedDb | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.seeds)) return null;
    return parsed as SeedDb;
  } catch {
    return null;
  }
}

/** 창고가 며칠 됐나. 없으면 null. 월·금 갱신이라 3일이 넘으면 새로 긁을 때다. */
export function seedDbAgeDays(db: SeedDb | null, now: Date = new Date()): number | null {
  if (!db) return null;
  const at = Date.parse(db.builtAt);
  if (!Number.isFinite(at)) return null;
  return (now.getTime() - at) / 86400000;
}

export interface PickOptions {
  /** 이 회차에 쓸 개수. */
  limit: number;
  /** 검색량 하한. 게이트의 minSearchVolume 을 그대로 넘겨 쓴다. */
  minVolume: number;
  /**
   * 이 주제의 씨앗만 고른다. 주면 **업종이 그 주제로 매핑된 씨앗만** 쓴다 —
   * 자동차 주제에 페키니즈분양이 가는 것을 막는다(실측). 매핑된 업종이 없는
   * 주제(사회·정치)는 빈 배열이 되고, 그 주제는 기존 씨앗으로 그대로 돈다.
   * 안 주면 주제를 가리지 않는다(옛 동작).
   */
  topic?: string;
  /** 이미 쓰는 씨앗(상시·계절). 겹치면 뺀다. */
  exclude?: readonly string[];
  /**
   * 회차 번호. 이 값만큼 창을 민다 — 같은 값이면 같은 결과다(재현 가능).
   * 안 주면 '연-월-일'을 숫자로 만들어 쓴다: 하루가 지나면 다른 구간을 판다.
   */
  round?: number;
}

const compact = (text: string): string => String(text || '').replace(/\s+/g, '');

/** 날짜에서 회차 번호를 만든다. 같은 날은 같은 값 — 회차가 재현된다. */
export function roundFromDate(now: Date = new Date()): number {
  return Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`);
}

/**
 * 이 회차에 팔 씨앗을 고른다.
 *
 * 검색량 큰 순으로 세운 뒤 회차 번호로 창을 민다. 창이 끝에 닿으면 앞으로 돌아온다 —
 * 회차를 거듭하면 창고 전체를 훑는다. 큰 것만 반복해서 파고 끝나지 않는다.
 */
export function pickSeeds(db: SeedDb | null, options: PickOptions): string[] {
  if (!db || !Array.isArray(db.seeds) || db.seeds.length === 0) return [];
  const limit = Math.max(0, Math.floor(options.limit) || 0);
  if (limit === 0) return [];

  const blocked = new Set((options.exclude || []).map(compact));
  /*
   * 주제를 고르면 업종당 상위 BIZTP_TOP_N 만 본다 — 뒤쪽은 그 업종 색이 옅어져서
   * 딴 밭이 섞인다(실측). 창고는 검색량 순으로 저장돼 있지 않으므로 여기서 센다.
   */
  const rankInBiztp = new Map<string, number>();
  if (options.topic) {
    const byBiztp = new Map<string, SeedDbEntry[]>();
    for (const entry of db.seeds) {
      const source = String(entry.source || '');
      if (!source.startsWith('biztp:')) continue;
      if (!byBiztp.has(source)) byBiztp.set(source, []);
      byBiztp.get(source)!.push(entry);
    }
    for (const rows of byBiztp.values()) {
      rows.sort((a, b) => b.searchVolume - a.searchVolume);
      rows.forEach((entry, index) => rankInBiztp.set(entry.keyword, index));
    }
  }
  const pool = db.seeds
    .filter((entry) => Number(entry.searchVolume) >= options.minVolume)
    .filter((entry) => !blocked.has(compact(entry.keyword)))
    .filter((entry) => !options.topic || topicOfSeed(entry) === options.topic)
    .filter((entry) => !options.topic || (rankInBiztp.get(entry.keyword) ?? 0) < BIZTP_TOP_N)
    .sort((a, b) => b.searchVolume - a.searchVolume);
  if (pool.length === 0) return [];
  if (pool.length <= limit) return pool.map((entry) => entry.keyword);

  const round = Number.isFinite(options.round) ? Number(options.round) : roundFromDate();
  // 창의 시작점. 회차마다 limit 만큼 밀리고, 끝에 닿으면 앞으로 돌아온다.
  const start = (Math.abs(Math.floor(round)) * limit) % pool.length;
  const picked: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    picked.push(pool[(start + i) % pool.length].keyword);
  }
  return picked;
}
