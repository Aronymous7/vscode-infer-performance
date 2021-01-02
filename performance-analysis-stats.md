# Infer + Extension Runtimes on Java Projects

- Stats for file- and LOC count are taken from the program `cloc` executed on the project folder.
- Infer command used: `infer --cost-only --keep-going -- <build-command>`
  - `--keep-going` ensures that infer attempts to continue its analysis even when it encounters a failure somewhere.
- Time for loading data into extension was taken by measuring the execution time of the `readInferOut` function in `inferController.ts`
- Time for receiving the feedback that the cost might have changed after a potentially significant code change was measured on the Java source file in the project with the highest LOC (again, according to `cloc`). The code change is the addition of `while (false) {}` in the last method of the file.
- PC specs:
  - **OS**: Manjaro Linux
  - **Processor**: Intel(R) Core(TM) i7-6700HQ CPU @ 2.60GHz, 8 Cores
  - **RAM**: 8GB

## Hello World

**GitHub:** https://github.com/jabedhasan21/java-hello-world-with-gradle (commit ec605015058598f87e9e250745327670295f17b6)

- Build tool: Gradle
- Java files: 3
- Java LOC: 64

### Build command: `./gradlew classes`

#### Compilation + Capturing

**Runtimes:** 5138 5319 5184 5024 5050 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 5024 | 5319 | 295 | 5138 | 5143 | 118 |

#### Analyzing

**Runtimes:** 46 45 47 46 45 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 45 | 47 | 2 | 46 | 46 | 1 |

#### Loading into Extension

**Runtimes:** 4 12 10 4 13 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 4 | 13 | 9 | 10 | 9 | 4 |

#### Feedback after Code Change

- File: src/main/java/hello/Greeter.java
- LOC: 23

**Runtimes:** 4 2 1 1 1 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 1 | 4 | 3 | 1 | 2 | 1 |


## Hystrix

**GitHub:** https://github.com/Netflix/Hystrix (commit 3cb21589895e9f8f87cfcdbc9d96d9f63d48b848)

- Build tool: Gradle
- Java files: 411
- Java LOC: 50510

### Build command: ./gradlew classes

#### Compilation + Capturing

**Runtimes:** 29 30 28 29 27 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 27 | 30 | 3 | 29 | 29 | 1 |

#### Analyzing

**Runtimes:** 4 3 3 3 3 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 3 | 4 | 1 | 3 | 3 | 0 |

#### Loading into Extension

**Runtimes:** 61 77 58 53 65 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 53 | 77 | 24 | 61 | 63 | 9 |

#### Feedback after Code Change

- File: hystrix-core/src/main/java/com/netflix/hystrix/AbstractCommand.java
- LOC: 1467

**Runtimes:** 6 7 8 3 10 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 3 | 10 | 7 | 7 | 7 | 3 |


## OpenRefine

**GitHub:** https://github.com/OpenRefine/OpenRefine (commit 63ebccfa2d8cd680dbbc46f0f34195dcfd84f232)

- Build tool: Maven

### Build command: mvn compile -pl main

- Java files: 754
- Java LOC: 57161

#### Compilation + Capturing

**Runtimes:** 21 21 21 21 21 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 21 | 21 | 0 | 21 | 21 | 0 |

#### Analyzing

**Runtimes:** 5 4 4 5 5 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 5 | 4 | 1 | 5 | 5 | 1 |

#### Loading into Extension

**Runtimes:** 111 97 81 87 68 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 68 | 111 | 43 | 87 | 89 | 16 |

#### Feedback after Code Change

- File: src/com/google/refine/clustering/binning/Metaphone3.java
- LOC: 4716

**Runtimes:** 16 10 9 8 5 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 5 | 16 | 11 | 9 | 10 | 4 |


## BioJava

**GitHub:** https://github.com/biojava/biojava (commit b9519e4c568e8423dcfb9b5fdb06688935360dd7)

- Build tool: Maven
- Java files: 1322
- Java LOC: 150908

### Build command: mvn compile

#### Compilation + Capturing

**Runtimes:** 87 87 86 86 87 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 86 | 87 | 1 | 87 | 87 | 1 |

#### Analyzing

**Runtimes:** 21 21 21 21 21 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 21 | 21 | 0 | 21 | 21 | 0 |

#### Loading into Extension

**Runtimes:** 288 297 217 238 166 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 166 | 297 | 131 | 238 | 241 | 54 |

#### Feedback after Code Change

- File: biojava-structure/src/main/java/org/biojava/nbio/structure/io/PDBFileParser.java
- LOC: 1949

**Runtimes:** 8 9 30 17 6 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 6 | 30 | 24 | 9 | 14 | 10 |


### Build command: mvn compile -pl biojava-core

- Java files: 221
- Java LOC: 19325

#### Compilation + Capturing

**Runtimes:** 8 8 8 8 8 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 8 | 8 | 0 | 8 | 8 | 0 |

#### Analyzing

**Runtimes:** 2 2 2 2 2 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 2 | 2 | 0 | 2 | 2 | 0 |

#### Loading into Extension

**Runtimes:** 46 57 42 29 39 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 29 | 57 | 28 | 42 | 43 | 10 |

#### Feedback after Code Change

- File: biojava-core/src/main/java/org/biojava/nbio/core/sequence/loader/UniprotProxySequenceReader.java
- LOC: 535

**Runtimes:** 3 5 5 5 6 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 3 | 6 | 3 | 5 | 5 | 1 |


## Elasticsearch (old version from 2015 with performance bug)

**GitHub:** https://github.com/elastic/elasticsearch (commit 4a0187942ff79683aa462121b50dcb2230cc56bd)

- Build tool: Maven
- Java files: 4161
- Java LOC: 457286

### Build command: mvn compile

#### Compilation + Capturing

**Runtimes:** 169 150 127 126 126 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 126 | 169 | 43 | 127 | 140 | 19 |

#### Analyzing

**Runtimes:** 41 39 39 39 38 s

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 38 | 41 | 3 | 39 | 39 | 1 |

#### Loading into Extension

**Runtimes:** 548 524 546 419 520 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 419 | 548 | 129 | 524 | 511 | 53 |

#### Feedback after Code Change

- File: core/src/main/java/org/elasticsearch/index/translog/Translog.java
- LOC: 1381

**Runtimes:** 6 12 15 7 14 ms

| Minimum | Maximum | Range | Median | Mean | SD |
|---|---|---|---|---|---|
| 6 | 15 | 9 | 12 | 11 | 4 |
