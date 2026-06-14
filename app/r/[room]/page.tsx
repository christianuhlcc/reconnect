import RoomLoader from '@/components/RoomLoader';

type Props = { params: Promise<{ room: string }> };

export default async function RoomPage({ params }: Props) {
  const { room } = await params;
  return <RoomLoader room={room} />;
}
