function jsonType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  const parts = ref.slice(2).split("/");
  let current = root;
  for (const part of parts) {
    if (current == null || !(part in current)) {
      throw new Error(`Unresolved $ref: ${ref}`);
    }
    current = current[part];
  }
  return current;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validateNode(value, schema, root, path, errors) {
  if (schema.$ref) {
    validateNode(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = jsonType(value);
    const ok = types.some((type) => {
      if (type === "number") return actual === "number" || actual === "integer";
      return actual === type;
    });
    if (!ok) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${actual}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
    }
    if (schema.format === "date" && !isValidDate(value)) {
      errors.push(`${path}: expected YYYY-MM-DD date`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} items`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) {
        errors.push(`${path}: items must be unique`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateNode(item, schema.items, root, `${path}/${index}`, errors);
      });
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
    for (const key of Object.keys(value)) {
      if (properties[key]) {
        validateNode(value[key], properties[key], root, `${path}/${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }

  if (schema.not) {
    const inner = [];
    validateNode(value, schema.not, root, path, inner);
    if (inner.length === 0) {
      errors.push(`${path}: matches a forbidden schema`);
    }
  }

  if (schema.allOf) {
    for (const clause of schema.allOf) {
      applyConditional(value, clause, root, path, errors);
    }
  }
}

function applyConditional(value, clause, root, path, errors) {
  if (!clause.if) {
    validateNode(value, clause, root, path, errors);
    return;
  }
  const probe = [];
  validateNode(value, clause.if, root, path, probe);
  if (probe.length === 0 && clause.then) {
    validateNode(value, clause.then, root, path, errors);
  }
  if (probe.length > 0 && clause.else) {
    validateNode(value, clause.else, root, path, errors);
  }
}

export function validateAgainstSchema(data, schema) {
  const errors = [];
  validateNode(data, schema, schema, "#", errors);
  return errors;
}
