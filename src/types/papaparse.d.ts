declare module "papaparse" {
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean;
    [key: string]: unknown;
  }
  interface ParseError {
    message: string;
    type: string;
    code: string;
    row?: number;
  }
  interface ParseResult<T = Record<string, string>> {
    data: T[];
    errors: ParseError[];
    meta: { fields?: string[] };
  }
  const Papa: {
    parse<T = Record<string, string>>(input: string, config?: ParseConfig): ParseResult<T>;
  };
  export default Papa;
}
