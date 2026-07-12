import { readFileSync } from 'fs';
import { join } from 'path';
import * as Handlebars from 'handlebars';

// Same location as the MailerModule template dir configured in app.module.ts.
const TEMPLATES_DIR = join(process.cwd(), 'src', 'common', 'email', 'templates');

const cache = new Map<string, Handlebars.TemplateDelegate>();

/**
 * Renders a Handlebars template from the shared templates dir.
 * Lets providers without a template engine of their own (Brevo, which only
 * takes raw htmlContent) reuse the exact same markup as the Nodemailer path.
 */
export function renderTemplate(
  name: string,
  context: Record<string, unknown>,
): string {
  let template = cache.get(name);

  if (!template) {
    const source = readFileSync(join(TEMPLATES_DIR, `${name}.hbs`), 'utf8');
    template = Handlebars.compile(source);
    cache.set(name, template);
  }

  return template(context);
}
