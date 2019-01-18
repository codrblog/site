const INTERPOLATE_MATCHER = /\{\{\s*?([\S=]+?)\s*?\}\}/g;

export class Interpolation {
  static interpolate(template: string, variables: { [k: string]: any; } ) {
    return template.replace(INTERPOLATE_MATCHER, (_, key) => key in variables ? variables[key] : '');
  }
}
