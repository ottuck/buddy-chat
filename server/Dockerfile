# Server image, built by Railway from this folder (railway.json; docs/server-design.md, 인프라).
# docker build -t buddy-chat-server server/

FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
# Dependencies first, so code changes reuse the cached layer.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY src src
# Tests run in CI before an image is built.
RUN ./gradlew --no-daemon bootJar \
    && java -Djarmode=tools -jar build/libs/app.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 1001 app
USER app
WORKDIR /app
# Layers from least to most often changed.
COPY --from=build /src/extracted/dependencies/ ./
COPY --from=build /src/extracted/spring-boot-loader/ ./
COPY --from=build /src/extracted/snapshot-dependencies/ ./
COPY --from=build /src/extracted/application/ ./
EXPOSE 8080
# The container's memory limit decides the heap.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]
