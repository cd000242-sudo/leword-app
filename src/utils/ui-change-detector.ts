/**
 * UI 변경 감지 유틸리티
 */

export class UIChangeDetector {
  private selectors: Map<string, string> = new Map();
  
  registerSelector(name: string, selector: string): void {
    this.selectors.set(name, selector);
  }
  
  async detectChanges(page: any): Promise<{ name: string; changed: boolean }[]> {
    const results: { name: string; changed: boolean }[] = [];
    
    for (const [name, selector] of this.selectors) {
      try {
        const element = await page.$(selector);
        results.push({
          name,
          changed: !element
        });
      } catch (error) {
        results.push({
          name,
          changed: true
        });
      }
    }
    
    return results;
  }
  
  hasChanges(results: { name: string; changed: boolean }[]): boolean {
    return results.some(r => r.changed);
  }
  
  static detectChange(page: any, selector?: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        if (selector) {
          const element = await page.$(selector);
          resolve(!element);
        } else {
          // 기본 감지 - 페이지 자체가 있는지
          resolve(false);
        }
      } catch {
        resolve(true);
      }
    });
  }
}
