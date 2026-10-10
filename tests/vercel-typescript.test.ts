import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function functionCompiler() {
  const root = process.cwd();
  const configPath = join(root, 'tsconfig.json');
  const result = ts.readConfigFile(configPath, ts.sys.readFile);
  if (result.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(result.error.messageText, '\n'),
    );
  // @vercel/node 22 applies these defaults before resolving `extends`.
  const config = result.config;
  config.compilerOptions ??= {};
  config.compilerOptions.target ??= 'ES2021';
  config.compilerOptions.esModuleInterop ??= true;
  if (config.compilerOptions.module === undefined) {
    config.compilerOptions.module = 'NodeNext';
    config.compilerOptions.moduleResolution = 'NodeNext';
    config.compilerOptions.strict = false;
  }
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    root,
    undefined,
    configPath,
  );
  // The Function builder's language service host has no `realpath`. Unlike
  // tsc, it resolves pnpm-linked packages from their public node_modules path.
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot(file) {
      const contents = ts.sys.readFile(file);
      return contents === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    readFile: ts.sys.readFile,
    fileExists: ts.sys.fileExists,
    directoryExists: ts.sys.directoryExists,
    readDirectory: ts.sys.readDirectory,
    getDirectories: ts.sys.getDirectories,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  return { parsed, service: ts.createLanguageService(host) };
}

it('retains strict NodeNext options when the Function builder applies defaults', () => {
  const { parsed, service } = functionCompiler();
  try {
    expect(parsed.errors).toEqual([]);
    expect(parsed.options.module).toBe(ts.ModuleKind.NodeNext);
    expect(parsed.options.moduleResolution).toBe(
      ts.ModuleResolutionKind.NodeNext,
    );
    expect(parsed.options.target).toBe(ts.ScriptTarget.ES2023);
    expect(parsed.options.strict).toBe(true);
    expect(parsed.options.noUncheckedIndexedAccess).toBe(true);
    expect(parsed.options.exactOptionalPropertyTypes).toBe(true);
  } finally {
    service.dispose();
  }
});

it('checks Web API types and the Drizzle adapter through the Function compiler host', () => {
  const { parsed, service } = functionCompiler();
  try {
    const diagnostics = parsed.fileNames.flatMap((file) => [
      ...service.getSemanticDiagnostics(file),
      ...service.getSyntacticDiagnostics(file),
    ]);
    expect(
      diagnostics.map((diagnostic) => ({
        file: diagnostic.file?.fileName,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      })),
    ).toEqual([]);
  } finally {
    service.dispose();
  }
});
