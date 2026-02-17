import { describe, it, expect } from 'vitest';
import { buildCodeMessages } from '../utils/promptTemplates';

describe('Codegen prompt includes attribution requirements', () => {
  it('requires header and properties for MQL4', () => {
    const msgs = buildCodeMessages('mql4', { description: 'trend', instrument: 'EURUSD', timeframe: 'H1', platform: 'mql4' });
    const user = msgs.find(m => m.role === 'user')!.content as string;
    expect(user.includes('Copyright © EA Coder AI - All Rights Reserved')).toBe(true);
    expect(user.includes('copyright = "EA Coder AI"')).toBe(true);
    expect(user.includes('link = "eacoderai.com"')).toBe(true);
  });

  it('requires header and properties for Pine', () => {
    const msgs = buildCodeMessages('pinescript', { description: 'breakout', instrument: 'GBPUSD', timeframe: 'M15', platform: 'pinescript' });
    const user = msgs.find(m => m.role === 'user')!.content as string;
    expect(user.includes('Copyright © EA Coder AI - All Rights Reserved')).toBe(true);
    expect(user.includes('copyright = "EA Coder AI"')).toBe(true);
    expect(user.includes('link = "eacoderai.com"')).toBe(true);
  });
});
