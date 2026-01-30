# Plant Regulatory Network Tool

<div align="center">
  <h3>Plant Regulatory Network Tool</h3>
  <p>Plant Regulatory Network Tool is a web-based tool for the integration, filtering, and visualization of plant gene regulatory networks using functional annotations and curated regulatory interaction datasets.</p>
</div>

---

## 🧬 Description (Overview)

Plant Regulatory Network Tool is a computational tool developed by the **Plant Genome Regulation Lab (Núcleo Milenio PhytoLearning)** to explore plant gene regulatory networks through the integration of multiple sources of regulatory evidence.

The tool enables users to filter and visualize gene regulatory networks based on functional annotations, with a particular focus on stress- and hormone-related biological processes. Regulatory interactions are integrated from curated databases such as ConnectTF, together with inferred gene regulatory networks and Gene Ontology annotations.

The primary goal of the tool is to support hypothesis-driven exploration of transcriptional regulation in plant genomes by allowing users to focus on biologically relevant subnetworks.

## 🔗 Data sources

The current implementation integrates:

*   **Gene Ontology annotations**
    *   Source: Gene Ontology Consortium (GAF format, release 26/01)
    *   File example: `GO.allframe.ATH.26012026.tsv`

*   **Regulatory interaction datasets**
    *   Curated TF–target interactions from ConnectTF
    *   Inferred gene regulatory networks (GRNs)

## 🧪 Functional focus

The tool is optimized for the exploration of regulatory networks associated with key biological processes, including:

*   `GO:0009414` — water deprivation
*   `GO:0009737` — response to abscisic acid (ABA)
*   `GO:0009738` — ABA-activated signaling pathway
*   `GO:0006970` — response to osmotic stress
*   `GO:0009733` — response to auxin

Special emphasis is placed on the analysis of transcription factors prioritized by the lab, including:

**NLP7, TGA1, HB7, ABF2, GBF3, and MYB44**

## 🧠 Core features

*   Integration of heterogeneous regulatory interaction datasets
*   GO-based filtering of nodes and edges in gene regulatory networks
*   Interactive visualization of regulatory subnetworks
*   Focused exploration of transcription factor–centered networks
*   Reproducible and extensible design for additional annotations and datasets

## 🛠️ Usage

### Prerequisites
*   Node.js v16+ (or v18+ recommended)
*   **Note**: If using **WSL**, ensure you are running in the WSL environment.

### Setup & Run
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Launch the platform:
    ```bash
    npm run dev
    ```
    Access the app at `http://localhost:3000`.

## 📂 Data Architecture

Data files are served statically from `public/data/` and ingested by the `DataService` on client-load:
*   `dap.tsv`, `chip.tsv`, `target.tsv`: Interaction networks.
*   `mapping.tsv`: ID -> Symbol conversion.
*   `process.txt`: Gene -> Process annotations.

---

*Plant Regulatory Network Tool is designed for rapid hypothesis generation in plant systems biology.*
