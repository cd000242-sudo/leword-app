import { extractNaverBlogPostIdentity, isSameNaverBlogPost } from '../pro-hunter-v12/rank-url-normalizer';

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

const canonical = 'https://blog.naver.com/Some_ID/223456789012';
const mobile = 'https://m.blog.naver.com/Some_ID/223456789012?foo=bar';
const postView = 'https://blog.naver.com/PostView.naver?blogId=Some_ID&logNo=223456789012&from=search';
const mobilePostView = 'https://m.blog.naver.com/PostView.naver?blogId=Some_ID&logNo=223456789012&navType=by';
const encodedPostView =
  'https%3A%2F%2Fblog.naver.com%2FPostView.naver%3FblogId%3DSome_ID%26logNo%3D223456789012';
const searchRedirect =
  'https://search.naver.com/p/crd/rd?m=1&u=https%3A%2F%2Fm.blog.naver.com%2FSome_ID%2F223456789012';

assert('canonical blog URL extracts lowercase blog id and post no',
  JSON.stringify(extractNaverBlogPostIdentity(canonical)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('mobile blog URL extracts same identity',
  JSON.stringify(extractNaverBlogPostIdentity(mobile)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('PostView URL extracts same identity',
  JSON.stringify(extractNaverBlogPostIdentity(postView)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('mobile PostView URL extracts same identity',
  JSON.stringify(extractNaverBlogPostIdentity(mobilePostView)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('encoded PostView URL extracts same identity',
  JSON.stringify(extractNaverBlogPostIdentity(encodedPostView)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('search redirect extracts nested blog identity',
  JSON.stringify(extractNaverBlogPostIdentity(searchRedirect)) === JSON.stringify({ blogId: 'some_id', postNo: '223456789012' }));

assert('canonical and PostView URLs match as the same post', isSameNaverBlogPost(canonical, postView));
assert('canonical and mobile URLs match as the same post', isSameNaverBlogPost(canonical, mobile));
assert('same blog with different post no does not match',
  !isSameNaverBlogPost(canonical, 'https://blog.naver.com/Some_ID/223456789013'));
assert('different blog with same post no does not match',
  !isSameNaverBlogPost(canonical, 'https://blog.naver.com/Other_ID/223456789012'));

console.log(`\n[rank-url-normalizer.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
