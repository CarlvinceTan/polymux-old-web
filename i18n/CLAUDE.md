## vue-i18n escaping

The `@` symbol is a special character in vue-i18n (linked messages). Always escape it as `{'@'}` in locale JSON values. Failure to do so causes a build error (`Invalid linked format`, error code 10).

Example: `"usernamePlaceholder": "you{'@'}example.com"` instead of `"usernamePlaceholder": "you@example.com"`