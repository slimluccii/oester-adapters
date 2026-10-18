export const revalidate = 1;

export default function Isr() {
  return <p id="rendered">rendered at {Date.now()}</p>;
}
