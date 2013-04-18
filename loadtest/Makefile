.PHONY: build test bench

# build virtualenv
build:
	virtualenv --no-site-packages .
	bin/pip install funkload

# run a single test, for sanity-checking
test:
	bin/fl-run-test stress.py

# run actual funkload bench (called from dist.sh over ssh)
bench:
	bin/fl-run-bench stress.py StressTest.test_syncstore_read_and_write
