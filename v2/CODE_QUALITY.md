# Code Quality Setup

This project uses modern tooling for code quality, matching industry best practices.

## 🔧 Tools

### Biome (v1.9.4)
Replaces ESLint + Prettier with a single, fast tool.

- **Linting**: Catches bugs, enforces style
- **Formatting**: Auto-formats on save
- **Import Organization**: Automatically sorts imports

### TypeScript (v5.9+)
Strict mode enabled with all safety checks:
- ✅ No implicit any
- ✅ No unused locals/parameters
- ✅ No unchecked indexed access
- ✅ Isolated modules
- ✅ Strict null checks

### Bun Test
Native Bun test runner:
- Fast execution (5-10x faster than Jest)
- TypeScript support out of the box
- Coverage reporting built-in

## 📝 Commands

### Everyday Development
```bash
# Format all code
bun run format

# Check formatting (no changes)
bun run format:check

# Lint code
bun run lint

# Auto-fix lint issues
bun run fix

# Fix with unsafe transformations
bun run fix:unsafe

# Type check
bun run typecheck

# Run everything (lint + typecheck)
bun run check
```

### Testing
```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Coverage report
bun test --coverage

# Unit tests only
bun test tests/unit

# Integration tests
bun test tests/integration

# E2E tests
bun test tests/e2e
```

### Full Quality Check
```bash
# Format + Lint + Typecheck + Test
bun run quality
```

## 🎯 CI/CD

GitHub Actions runs on every PR:

1. **Code Quality** - Lint + Format check + Typecheck
2. **Tests** - Full test suite with coverage
3. **Build** - Verify application builds

All checks must pass before merging.

## ⚙️ VSCode Integration

Install the **Biome extension** for best experience:
- Format on save (auto-enabled)
- Lint errors inline
- Quick fixes on save

### Recommended Extensions
- `biomejs.biome` - Biome formatter/linter
- `oven.bun-vscode` - Bun runtime support

## 📐 Configuration Files

- `biome.json` - Biome linting + formatting rules
- `tsconfig.json` - TypeScript compiler options
- `.github/workflows/ci.yml` - CI/CD pipeline
- `.vscode/settings.json` - Editor settings

## 🚨 Common Issues

### Lint Errors
```bash
# Auto-fix most issues
bun run fix

# Apply unsafe fixes (use carefully)
bun run fix:unsafe
```

### Format Conflicts
```bash
# Reformat entire codebase
bun run format
```

### Type Errors
```bash
# Run type check with detailed output
bun run typecheck
```

## 📊 Rules Enforced

### Linting
- ✅ No unused variables
- ✅ No duplicate imports
- ✅ No constant conditions
- ✅ Consistent code style
- ✅ Import sorting

### Formatting
- **Indent**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Single quotes for strings
- **Semicolons**: Always
- **Trailing commas**: ES5 style
- **Arrow parentheses**: Always

### TypeScript
- **Strict mode**: Enabled
- **No implicit any**: Error
- **Unused parameters**: Error
- **No unchecked indexed access**: Error
- **Isolated modules**: Required

## 🎨 Best Practices

1. **Format before committing**
   ```bash
   bun run format && bun run check
   ```

2. **Fix lint issues immediately**
   - Don't disable rules without good reason
   - Use `fix` command for safe fixes

3. **Run tests before pushing**
   ```bash
   bun test
   ```

4. **Let CI catch issues**
   - Don't bypass CI checks
   - Fix issues found by CI

## 🔄 Pre-commit Hook (Optional)

Add to `.husky/pre-commit`:
```bash
#!/bin/sh
bun run format
bun run lint
bun run typecheck
```

## 📚 Resources

- [Biome Documentation](https://biomejs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Bun Test Runner](https://bun.sh/docs/cli/test)

---

**Quality Standard**: All code must pass `bun run check` before merging.
