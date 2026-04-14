#!/usr/bin/env python3
"""
LEWORD UI 정적 스모크 테스트

검증 항목:
1. onclick="FN(...)" / onclick="window.FN(...)" 의 모든 함수명 수집
2. 정의 수집: function FN() / window.FN = function / FN = function
3. 호출되지만 정의 없는 함수 (깨진 참조) 보고
4. 모달 맵 엔트리가 실제 함수와 매칭되는지 확인
5. window.electronAPI.invoke('...') 호출명 수집 (참고용)
"""

import re
import sys

HTML = 'ui/keyword-master.html'

with open(HTML, 'r', encoding='utf-8') as f:
    content = f.read()

print(f'HTML size: {len(content):,} chars')
print(f'HTML lines: {content.count(chr(10)):,}')

# ============================================================
# 1. onclick 함수 호출 수집
# ============================================================
# onclick="funcName(...)" 또는 onclick="event.stop...; funcName(...)"
onclick_pattern = re.compile(
    r'onclick="(?:[^"]*?;\s*)?(?:window\.)?([a-zA-Z_$][\w$]*)\s*\('
)
onclick_calls = set()
for m in onclick_pattern.finditer(content):
    name = m.group(1)
    # Skip meta functions
    if name in ('console', 'event', 'alert', 'confirm', 'setTimeout', 'setInterval', 'this', 'return'):
        continue
    onclick_calls.add(name)

# Also catch `onclick="someFn()"` with full script inside
onclick_full = re.compile(r'onclick="([^"]+)"')
additional = set()
for m in onclick_full.finditer(content):
    script = m.group(1)
    # Find all top-level function calls
    fn_calls = re.findall(r'(?<!\.)\b([a-zA-Z_$][\w$]*)\s*\(', script)
    for fn in fn_calls:
        if fn not in ('if', 'for', 'while', 'return', 'typeof', 'new', 'alert', 'confirm', 'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Math', 'Date', 'JSON', 'console', 'event', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'):
            additional.add(fn)

onclick_calls |= additional

print(f'\nOnclick-referenced functions: {len(onclick_calls)}')

# ============================================================
# 2. 함수 정의 수집
# ============================================================
defined = set()

# function FN()
for m in re.finditer(r'function\s+([a-zA-Z_$][\w$]*)\s*\(', content):
    defined.add(m.group(1))

# window.FN = function
for m in re.finditer(r'window\.([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?function', content):
    defined.add(m.group(1))

# const FN = (...) =>  (arrow in window assignment)
for m in re.finditer(r'window\.([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?\(', content):
    defined.add(m.group(1))

print(f'Defined functions: {len(defined)}')

# ============================================================
# 3. 깨진 참조 찾기
# ============================================================
broken = onclick_calls - defined
# 일부는 브라우저 내장 (closeModal, copyToClipboard 등) — HTML 내부 정의만 체크
print(f'\n=== 깨진 onclick 참조: {len(broken)} ===')
for fn in sorted(broken):
    # Count usages
    usages = content.count(f'{fn}(')
    print(f'  ✗ {fn}() — {usages}회 호출됨')

# ============================================================
# 4. 모달 맵 검증
# ============================================================
print('\n=== 모달 맵 엔트리 검증 ===')
modal_map_pattern = re.compile(r"'([a-z-]+)':\s*(create\w+Modal)")
for m in modal_map_pattern.finditer(content):
    key, fn = m.group(1), m.group(2)
    status = '✓' if fn in defined else '✗'
    print(f'  {status} {key} → {fn}')

# ============================================================
# 5. electronAPI.invoke 호출명 수집 (참고)
# ============================================================
print('\n=== electronAPI.invoke 호출 ===')
invokes = set()
for m in re.finditer(r"electronAPI[?\.]*invoke\(\s*['\"]([a-z-]+)['\"]", content):
    invokes.add(m.group(1))
print(f'  총 {len(invokes)}개 IPC 채널 호출')
for ch in sorted(invokes)[:30]:
    print(f'  - {ch}')
if len(invokes) > 30:
    print(f'  ... 외 {len(invokes) - 30}개')

# ============================================================
# 6. 종합
# ============================================================
print('\n' + '=' * 50)
exit_code = 0
if broken:
    print(f'❌ FAIL: {len(broken)}개 깨진 onclick 참조')
    exit_code = 1
else:
    print('✅ PASS: 모든 onclick 참조가 정의와 매칭')

sys.exit(exit_code)
