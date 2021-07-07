<?php
namespace App\Controller;

use Doctrine\DBAL\DriverManager;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * class LoginController
 * @package ${NAMESPACE}
 * @author Mateusz Bochen
 */
class DatabaseController
{
    #[Route('/api/get-tables', name: 'get_tables_action', methods: ['post'])]
    public function login(Request $request): JsonResponse
    {

        $host = $request->get('host');
        $login = $request->get('login');
        $password = $request->get('password');
        $databaseName = $request->get('databaseName');

        $connectionParams = [
            //'host' => '88.80.190.228',
            'driver' => 'pdo_mysql',
        ];

        if ($host) {
            $connectionParams['host'] = $host;
        }

        if ($password) {
            $connectionParams['password'] = $password;
        }

        if ($databaseName) {
            $connectionParams['dbname'] = $databaseName;
        }

        if ($login) {
            $connectionParams['user'] = $login;
        } else {
            return new JsonResponse(['message' => 'error', 'data' => 'Invalid User name'], Response::HTTP_UNAUTHORIZED);
        }

        try {
            $conn = DriverManager::getConnection($connectionParams);
            $sql = "SHOW TABLES";
            $stmt = $conn->executeQuery($sql);
            $data = $stmt->fetchAllAssociative();
            $newData = [];
            foreach ($data as $item) {
                foreach ($item as $value) {
                    $newData[] = $value;
                }
            }


            return new JsonResponse(['message' => 'ok', 'data' => $newData], Response::HTTP_OK);
        } catch (\Exception $exception) {
            return new JsonResponse(['message' => 'error', 'data' => $exception->getMessage()], Response::HTTP_UNAUTHORIZED);
        }
    }
}
