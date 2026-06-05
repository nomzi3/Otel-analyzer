Make a plan for initial setup for this application.

# Agent guide
Ask questions, do not guess or assume - if anything is unclear.
Challenge the information, and if there is a better idea available challenge with the info.

# Background
The goal of this application is to be the receiver of telemetry - metrics/logs/traces, storing them and all their attributes - and making it possible to iterate over and analyze them. The input will be in the form of a constant flow being generated and produced by a company's full techstack, including servers, applications, and external systems.

To make this possible, as there are a lot of generated telemetry - the application needs to be able to handle the load (defined later). The design needs to fit this requirement from the ground up.

To make it easier, there won't be input by all 3 signals at the same time - meaning when we ingest logs - most likely there won't be any metrics or traces ingested.

# Architecture
The architecture needs to be of the following requirements:

* dockerized
* setup to be done using docker-compose
* use a Makefile to handle everything for local testing
* backend is to be written in Go, frontend in NodeJs/HTML.

For architecture to handle the load, the following should be the base setup.
* Application should be built around a frontend, a backend.
* Frontend - ngninx-prod responsible for handling user requests to view the data.
* Frontend should be in darkmode, visually beautiful, and clearly show all telemetry. More features on the frontend will be done at a later stage - but as a base, show a landing page where you can view "All" telemetry, or split into log/metric/trace.
* frontend should be able to query the backend-api for database queries.

Backend should be split into:
* backend-gateway 
* kafka-layer (red panda)
* backend-ingester 
* backend-database
* backend-api
* prometheus + grafana


# Backend-gateway
* Responsible for offering endpoint for otlp (http, grpc), and forwarding it into a kafka-layer (red panda). 
* Does not modify the received telemetry in any way.
* Internal telemetry (observability) - Create metrics based on the flow of telemetry being received.
# Backend-gateway observability
To clearly get good observability on the received data, do the following.
* For traces received: count the number of spans for each unique traceID (total), sum of received spans per second (received in the backend-gateway), sum of spans per unique traceID. Add a dimension on the metric to clearly show which service.name (resource attribute) is sending the span
* For metrics received: sum of datapoints received per second in the gateway. Add a dimension on the metric to show which service.name is sending the datapoint.
* For logs received: sum of logs per second received in the gateway. Add dimension on which service.name that sent them.
* Export backend-gateway observability to the prometheus instance.

# Kafka-layer (red panda)
* one kafka topic per telemetry type (metric, trace, log)
* 4 partitions per topic
* retention should be 15 min, or 1GB of data - whichever arrives first
* add a test-script in the folder - that can be used manually to query the kafka-layer for current queue-size in each partition in a topic. For all topics available.

# Backend-ingester
* responsible for reading the kafka topics, processing + creating observability metrics, and exporting to the backend-database through the backend-api
* have a base replica of 1, but have a way to auto-scale it to multiple replicas if required.
* Do not flatten the attributes - keep attributes split up by resource.attributes, and scope attributes (log/metric/trace).
* For metrics received - store each metric name with unique attributes (resource.attributes and metric-attributes), and a time-series index of the timestamps in the metric - export this to the backend-database. 
* For traces received - store each unique traceID and all attributes (resoure-attributes + trace-attributes) - and link each connected span-attributes + resource-attributes. Export this to the backend-database.
* For logs received - make a review of the log message and locate any pattern that might be used. Store the pattern together with the resource.attributes + log.attributes and export to the backend-database. 
# backend-ingester observability
* For metrics - Calculate nr of datapoints per minute received - per metric and service.name and export to prometheus.
* For traces - Use the timestamp on the root traceID to calculate number of root traceID received per minute - per service.name.  Export this to prometheus
* For logs - use the timestamp on the log to calculate the number of logs received per minute - per service.name. Export this to prometheus.

# Backend-database
* will be fronted by the backend-API. No calls will be done directly to the database, other than through the backend-API
* the type of database needs to be reviewed. The work done in the backend-ingester will lower the amount of writes required, but there will be a lot of writes required. Make a review and give options on databases - and how much traffic they could handle running on a local machine.

# Backend-Api
* responsible for communication with backend-database
* offers paths for GET/PUT/POST to the backend-database
* will get requests from backend-ingester (writes) and frontend (reads + deletes)
* will not do any transform on the data, only offer a API to the backend-database
# backend-api observability
* create observability metrics on the traffic used - on what endpoint. R.E.D metrics on the traffic for each path. Export this observability-telemetry to prometheus

# prometheus + grafana
* single binary prometheus
* should be possible to write and query. Query will be done initially from grafana, but eventually frontend will fetch timeseries.
* have retention set to 1 hour initially.
* grafana - run version 13.0.2 - add prometheus as a datasource
* Create a dashboard for each module producing metrics - backend-gateway / backend-ingester / backend-api. Populate panels with these metrics.

## Testing
* Create a benchmark generator that will be used to test the ingress of telemetry.
* It should be possible to start the benchmark by using a make command, e.g. make test-telemetry. This should spin up a docker-container that forwards a specific amount of telemetry to the backend-gateway on /v1/logs, /v1/metrics, /v1/traces - used for a quick test. run it for 10 seconds, export every 5 seconds.
* the amount of telemetry generated should be set when starting, e.g. short test for 10 seconds, 30 seconds, 5 min, and 10 min of load. Which option to run should be set when running "make test-telemetry" - and possible to flag if only generate logs, only metrics, only traces - or all 3 signals.
* Add a option for how often to export telemetry. Every 5 seconds, 10 seconds, 15 seconds, 30 seconds.
* Generate 50 service.name (resource.attribute) that should be used for all telemetry types.
* The telemetry generated should be linked, meaning - a service.name should have log/metric/trace that works together - originate from the same system - to make them appear to be from a real system. E.g. common attributes. The log should add a traceID attribute that links to a traceID sent in the trace. 50% of the service.name should originate from kubernetes, the other 50% from physical/virtual servers.
* Logs - generate 10-20 logs per service.name, for each export. Add some pattern that can be used to test the pattern-recognition in the backend-ingester. Set timestamp to when the log is sent, follow otlp semantics.
* Metrics - generate 1 datapoint per metric-name per export. 20 metric-names from kubernetes, 10 from physical/virtual servers. Follow semantic convention with namespaces.
* traces - 1-5 root spans per service.name, 10-20 spans per root span - for each export.
* Add a option in Makefile so that running "make reset" automatically cleares backend-database of data (running through the backend-api)
