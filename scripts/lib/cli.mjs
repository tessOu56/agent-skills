export function parseArgs(argv, { flags = {}, aliases = {} } = {}) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = aliases[arg] || arg.slice(2);
    if (flags[key] === "boolean") {
      options[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = next;
    i += 1;
  }

  return { options, positionals };
}

export function todayUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
