IMAGE_NAME ?= clinfhir-redox
CONTAINER_NAME ?= clinfhir-redox

redox-up:
	@docker build -t $(IMAGE_NAME) .
	@docker run --rm -d --name $(CONTAINER_NAME) -p 8000:8000 $(IMAGE_NAME)
	@echo "Server running at http://localhost:8000"

redox-down:
	@-docker stop $(CONTAINER_NAME)

redox-logs:
	@docker logs -f $(CONTAINER_NAME)
