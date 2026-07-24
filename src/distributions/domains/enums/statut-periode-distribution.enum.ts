export enum StatutPeriodeDistribution {
  CALCULEE = 'calculee', // calcul fait, en attente validation admin
  VALIDEE = 'validee', // validée par admin, peut être distribuée
  DISTRIBUEE = 'distribuee', // versée aux investisseurs
  ANNULEE = 'annulee',
}
