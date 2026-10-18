"use server";

export async function greet(name: string) {
  return `hello ${name}, from a server action`;
}
