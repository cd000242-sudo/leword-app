import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const htmlPath = path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const sourceSignals = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'source-signals.ts'), 'utf8');
const premiumHunting = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'premium-hunting.ts'), 'utf8');
const configUtility = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'config-utility.ts'), 'utf8');
const bloggerProfile = fs.readFileSync(path.join(__dirname, '..', 'blogger-profile.ts'), 'utf8');

assert('keyword analyzer default option is 10',
  /name="keywordLimit"\s+value="10"\s+checked/.test(html),
  'keywordLimit checked value is not 10');

assert('keyword analyzer JS fallback defaults to 10',
  /const\s+limitValue\s*=\s*limitRadio\?\.value\s*\|\|\s*'10'/.test(html),
  'limitValue fallback is not 10');

assert('PRO traffic UI exposes 250 result option',
  /<option\s+value="250"[^>]*>250개/.test(html),
  '250 option missing');

assert('PRO traffic UI positions the feature as golden discovery super-upgrade',
  /황금키워드 발굴기의 초상위호환/.test(html)
    && /최대 250개 SSS 후보/.test(html)
    && /황금키워드 분석기가 놓치는 키워드/.test(html),
  'PRO super-upgrade positioning copy missing');

assert('PRO traffic UI clamps requested count to 250',
  /Math\.min\(250,\s*Math\.floor\(countNum\)\)/.test(html),
  'UI clamp is not 250');

assert('PRO traffic defaults to category-focus mode',
  /name="proTrafficMode"\s+value="category"\s+checked/.test(html)
    && /카테고리 하나를 깊게 파서/.test(html),
  'PRO traffic modal does not default to focused category hunting');

assert('PRO traffic requires one category before category hunting',
  /id="proTrafficCategory"[\s\S]*카테고리 먼저 선택/.test(html)
    && /mode\s*===\s*'category'\s*&&\s*!category/.test(html)
    && /카테고리 하나를 먼저 선택해야/.test(html)
    && /requestedMode\s*===\s*'category'[\s\S]*requestedCategory\s*===\s*'all'/.test(premiumHunting),
  'PRO traffic category guard missing');

assert('golden discovery UI requires category-first selection',
  /<option\s+value=""\s+disabled\s+selected[^>]*>카테고리 먼저 선택<\/option>/.test(html)
    && /먼저 황금키워드를 발굴할 카테고리를 선택해주세요/.test(html),
  'category-first prompt or guard is missing');

assert('golden discovery sends category-first mode to backend',
  /categoryFirst:\s*true/.test(html) && /requireCategory:\s*true/.test(html),
  'category-first backend flags missing');

assert('golden discovery exposes saved blog profile categories',
  /id="goldenProfileCategoryPanel"/.test(html)
    && /id="keywordProfileCategoryGroup"/.test(html)
    && /refreshGoldenProfileCategories/.test(html),
  'blog profile category shortcuts missing');

assert('blogger profile and golden dropdown expose policy and celebrity categories',
  /value="지원금"[^>]*>지원금\/정책\/복지/.test(html)
    && /value="스타"[^>]*>스타\/연예인 이슈/.test(html)
    && /지원금\/정책\/복지/.test(bloggerProfile)
    && /스타\/연예 이슈/.test(bloggerProfile),
  'policy/star categories are not exposed in profile or golden UI');

assert('PRO and home hunter category pickers expose policy and star intent paths',
  /value:\s*'policy',\s*label:\s*'[^']*정책·지원금'/.test(html)
    && /value:\s*'celeb',\s*label:\s*'[^']*연예\/이슈'/.test(html)
    && /<option\s+value="celebrity"[^>]*>[^<]*스타·연예<\/option>/.test(html),
  'policy/star categories are not exposed in PRO or home hunter UI');

assert('golden discovery makes profile categories single-focus execution',
  /집중 카테고리/.test(html)
    && /대표 1개/.test(html)
    && /대표 운영 카테고리/.test(html)
    && /다른 주제는 섞지 않습니다/.test(html),
  'single-focus category execution copy missing');

assert('blogger profile UI allows only one representative category',
  /type="radio"\s+name="bpCategory"/.test(html)
    && /대표 카테고리는 1개만 선택할 수 있습니다/.test(html)
    && !/name="bpCategory"[^>]+type="checkbox"/.test(html),
  'blogger profile category input is not singleton');

assert('blogger profile backend enforces one representative category',
  /selectedCategories\.length\s*!==\s*1/.test(sourceSignals)
    && /대표 카테고리는 1개만 선택 가능합니다/.test(sourceSignals)
    && /slice\(0,\s*1\)/.test(bloggerProfile),
  'backend singleton profile guard missing');

assert('blogger profile save refreshes golden discovery category shortcuts',
  /saveBloggerProfile[\s\S]*refreshGoldenProfileCategories/.test(html)
    && /resetBloggerProfile[\s\S]*refreshGoldenProfileCategories/.test(html),
  'profile save/reset does not refresh golden category UI');

assert('shopping connect no-keyword discovery requests 30 seeds',
  /autoDiscoveryLimit:\s*30/.test(html)
    && /autoDiscoveryLimit\s*=\s*Math\.min\(Math\.max\(Number\(params\?\.autoDiscoveryLimit\)\s*\|\|\s*30,\s*10\),\s*30\)/.test(configUtility)
    && /autoSeeds\.slice\(0,\s*30\)/.test(html),
  'shopping auto discovery is not using/showing 30 seeds');

assert('shopping connect scores expanded products by their discovery query',
  /item\.discoveryQuery\s*\|\|\s*rootKeyword/.test(fs.readFileSync(path.join(__dirname, '..', 'naver-shopping-api.ts'), 'utf8'))
    && /buildProductLeWordSeeds\(item,\s*item\.discoveryQuery\s*\|\|\s*keyword,\s*6\)/.test(configUtility),
  'shopping expanded products are not discovery-query aware');

assert('policy briefing panel is full-width realtime-style and requests enough items',
  /지원금·정책 갓 떴음/.test(html)
    && /source-policy-briefing-aggregate',\s*\{\s*limit:\s*60\s*\}/.test(html)
    && /minmax\(min\(100%,\s*360px\),\s*1fr\)/.test(html)
    && /5분마다 자동 갱신/.test(html),
  'policy briefing realtime panel is not expanded');

console.log(`\n[ui-count-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
