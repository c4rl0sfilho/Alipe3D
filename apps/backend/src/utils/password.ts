import bcrypt from 'bcrypt';

export class PasswordHasher {
  /** Hash válido usado para igualar o tempo de resposta quando o e-mail não existe. */
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly rounds: number) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** Executa uma comparação "falsa" para evitar enumeração de usuários por tempo de resposta. */
  async simulateVerify(plain: string): Promise<void> {
    this.dummyHash ??= bcrypt.hash('alipe3d-dummy-password', this.rounds);
    await bcrypt.compare(plain, await this.dummyHash);
  }
}
