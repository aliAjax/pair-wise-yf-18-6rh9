import "./styles.css";
import Workbench from "./business/RemovalPage";

const project = {
  sourceNo: 8,
  id: "hxyfront-62006",
  port: 62006,
  title: "珠宝镶嵌宝石分拣",
  domain: "珠宝镶嵌",
  prompt:
    "客户改款拆镶闭环：拆镶单只能选已镶嵌且未交付的宝石；同颗已有未结拆镶单时整次拒绝；拆镶期间冻结配石与镶嵌位；复检有损伤转待修留只读记录，无损伤恢复待镶。数据仅存浏览器。",
};

function App() {
  return (
    <main className="app">
      <section className="hero compact-hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title} · 改款拆镶闭环</h1>
        <span>{project.prompt}</span>
      </section>

      <Workbench />
    </main>
  );
}

export default App;
