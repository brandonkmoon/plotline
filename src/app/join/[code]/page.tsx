import JoinScreen from "@/components/screens/JoinScreen";

export default function JoinWithCodePage({
  params,
}: {
  params: { code: string };
}) {
  return <JoinScreen initialCode={params.code} />;
}
