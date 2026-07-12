import { renderTemplate } from './template-renderer';

describe('renderTemplate', () => {
  it('renders the otp-code template with the code and expiry', () => {
    const html = renderTemplate('otp-code', {
      otp: '481920',
      expiresIn: '10 minutes',
    });

    expect(html).toContain('481920');
    expect(html).toContain('10 minutes');
    expect(html).toContain('BeOwn');
    // Handlebars placeholders must all be substituted.
    expect(html).not.toContain('{{');
  });

  it('escapes context values instead of injecting raw html', () => {
    const html = renderTemplate('otp-code', {
      otp: '<script>alert(1)</script>',
      expiresIn: '5 minutes',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
