/**
 * 대량 크롤링 시스템 스텁
 */

export class MassCrawlingSystem {
  constructor(
    public naverClientId?: string,
    public naverClientSecret?: string,
    public googleApiKey?: string,
    public googleCseId?: string
  ) {}

  async crawlAll(query: string, options?: any): Promise<any> {
    return { success: false, message: 'MassCrawlingSystem is not implemented' };
  }

  async test(): Promise<{ success: boolean; message?: string }> {
    return { success: false, message: 'MassCrawlingSystem is not implemented' };
  }
}

