.PHONY: check fix test

check:
	npx vue-tsc --build
	npx eslint .
	npx prettier --check .

fix:
	npx eslint . --fix
	npx prettier --write .

test:
	npm test

# Run inside the playwright container (kubectl exec deployment/electrical-e2e -c playwright -- make e2e)
.PHONY: e2e
e2e:
	npx playwright test
